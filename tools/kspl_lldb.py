# ==========================================
# The pretty printer that shows LLDB KSPL's types in a shape it can read.
#
#     command script import tools/kspl_lldb.py     (`.vscode/launch.json` loads it)
#     command script import kspl_lldb.py           (the same, in the unpacked release zip)
#
# **The release zip puts it at the folder's top** (`.github/workflows/release.yml`), where the
# zip's own `launch.json` loads it.
#
# **It cannot be written in anything but Python**: LLDB's embedded interpreter loads it, and only
# there are `lldb`'s types reached.
#
# **It reads the C that ksplc writes**, so each name and field below is one the compiler emits.
# The self-test (no argument, at the end) builds `tools/tests/lldb_sample.kspl` with the compiler
# and checks those names against its C, then runs the printer in LLDB on it. So a name the
# compiler changes fails there, not on a user's screen.
# ==========================================
# Caution: **Keep it loadable where there is no `lldb`**, so the self-test runs from a bare
# python3; there only the shape is put in place.
try:
    import lldb
except ImportError:
    lldb = None
import os
import re
import shutil
import subprocess
import sys
import tempfile


# ------------------------------------------
# Type names: the C name back into KSPL's spelling
# ------------------------------------------
# genc writes a type's file path and its name joined by `_` (`std_ds_List_I32`), with the type
# arguments after it. The display leaves the file path out: the source names the type without it.

# The types whose names are all capitals and digits, or one word: no lower-case word follows them.
BUILTIN_TYPES = ("I8", "I16", "I32", "I64", "U8", "U16", "U32", "U64", "Sz", "F32", "F64",
                 "Bool", "Void")

# The generic types the display knows the arity of, by their words. An unknown generic takes every
# type after it as its arguments.
KNOWN_GENERICS = {
    ("Option",): 1, ("Result",): 2, ("List",): 1, ("Map",): 2, ("Map", "entry"): 2,
    ("Hashable",): 1, ("Iter",): 1, ("Index",): 2, ("Index", "ref"): 2, ("Index", "place"): 2,
    ("Index", "mut"): 2,
}

# The words a file path opens with. A lower-case word after a type's name is part of that name
# (`Made_err`) unless a path opens there (`I32_tools_tests_x_Made_err`).
PATH_ROOTS = ("std", "ksplc", "tools", "tests", "lib", "ksmd", "ksagent", "kssrv", "")


def _is_cap(tok):
    return tok[:1].isupper()


class _Names:
    def __init__(self, toks):
        self.toks = toks
        self.i = 0

    def more(self):
        return self.i < len(self.toks)

    def peek(self, at=0):
        j = self.i + at
        return self.toks[j] if j < len(self.toks) else None

    def suffixes(self, text, depth):
        while depth <= 1 and self.more():
            t = self.peek()
            if t == "Ptr":
                self.i += 1
                if self.peek() == "Const":
                    self.i += 1
                text += "@"
            elif t == "Array" and (self.peek(1) or "").isdigit():
                text += "[" + self.peek(1) + "]"
                self.i += 2
            elif t == "Const":
                self.i += 1
            else:
                break
        return text

    # `depth` is 0 for the whole name, 1 for its arguments. **Only those take a `_Ptr` or an
    # `_Array_N`**: `Option_std_ds_Map_entry_Slice_U8_Const_I32_Ptr` is an `Option` of a pointer
    # to the entry, not of an entry holding a pointer. The C spells it either way, so this side
    # picks the reading genc's names have.
    def type_(self, depth):
        top = depth == 0
        while self.more() and not _is_cap(self.peek()):
            self.i += 1
        if not self.more():
            raise ValueError("no type name")
        head = self.toks[self.i]
        self.i += 1
        if head == "Slice":
            inner = self.type_(depth + 1)
            if self.peek() == "Const":
                self.i += 1
            return self.suffixes(inner + "[]", depth)
        words = [head]
        arity = None
        for known, n in KNOWN_GENERICS.items():
            if known[0] == head and tuple(self.toks[self.i - 1:self.i - 1 + len(known)]) == known:
                if arity is None or len(known) > len(words):
                    words, arity = list(known), n
        if arity is not None:
            self.i += len(words) - 1
        elif head not in BUILTIN_TYPES:
            self.continuation(words)
        name = "_".join(words)
        args = []
        if arity is not None:
            for _ in range(arity):
                if not self.more():
                    break
                args.append(self.type_(depth + 1))
        elif top:
            while self.more() and self.peek() not in ("Ptr", "Const", "Array"):
                args.append(self.type_(depth + 1))
        if name == "Option" and len(args) == 1:
            text = args[0] + "?"
        elif name == "Result" and len(args) == 2:
            text = args[0] + "!" + args[1]
        elif args:
            text = name + "<|" + ", ".join(args) + "|>"
        else:
            text = name
        return self.suffixes(text, depth)

    def continuation(self, words):
        j = self.i
        while j < len(self.toks) and not _is_cap(self.toks[j]):
            j += 1
        run = self.toks[self.i:j]
        ends_name = j == len(self.toks) or self.toks[j] in ("Ptr", "Const", "Array")
        take = len(run)
        if not ends_name:
            take = next((k for k, t in enumerate(run) if t in PATH_ROOTS), len(run))
        words.extend(run[:take])
        self.i += take


# Puts a C type name back into KSPL's spelling (`std_ds_Map_Slice_U8_Const_I32` reads
# `Map<|U8[], I32|>`). A name it cannot read comes back as it was.
def demangle(name):
    if not name:
        return "Unknown"
    name = name.replace("struct ", "").replace("const ", "").strip()
    if name.startswith("kspl_"):
        name = name[len("kspl_"):]
    try:
        p = _Names(name.split("_"))
        out = p.type_(0)
        return out if not p.more() else name
    except ValueError:
        return name


# Puts a function's C name back, for the panic stop's backtrace. A function's name is lower case
# like its path, so only the `std_<file>_` paths are told apart.
def demangle_fn(name):
    if not name:
        return "Unknown"
    name = name.replace("kspl_priv_", "priv ").replace("kspl_", "")
    return re.sub(r'(^|\s)std_([a-z0-9]+)_', r'\1std.\2.', name)


# ------------------------------------------
# What each kind of value is recognised by
# ------------------------------------------
# **Each pattern is anchored at both ends.** An unanchored one also caught the types that name it
# in their arguments: `Option_Slice_U8_Const` read as a slice. LLDB's regular expressions have no
# look-ahead, so a pattern that must leave a longer name out does it inside its summary.
# Each row: the summary function, the pattern, and the fields the function reads (a matched type
# holds one of the sets).
SUMMARY_PATTERNS = (
    ("kspl_slice_summary", r"^Slice_[A-Za-z0-9_]+$", (("ptr", "len"),)),
    ("kspl_list_summary", r"^std_ds_List_[A-Za-z0-9_]+$", (("ptr", "len", "cap"),)),
    # It also catches `std_ds_Map_entry_…`, which the summary tells apart by its fields.
    ("kspl_map_summary", r"^std_ds_Map_[A-Za-z0-9_]+$",
     (("entries", "cap", "len"), ("key", "value", "is_active"))),
    ("kspl_builder_summary", r"^std_str_(Str_builder|Arena_text)$", (("ptr", "len", "cap"),)),
    ("kspl_ast_node_summary", r"^ksplc_base_ast_Ast_node$", (("kind_id", "text"),)),
)

SYNTHETIC_PATTERNS = (
    ("KsplSliceSyntheticProvider", r"^Slice_[A-Za-z0-9_]+$"),
    ("KsplSliceSyntheticProvider", r"^std_ds_List_[A-Za-z0-9_]+$"),
    ("KsplMapSyntheticProvider", r"^std_ds_Map_[A-Za-z0-9_]+$"),
)

# Where a program stops on a panic. `kspl_std_lang_panic` is std's (`panic`, a bounds check,
# `unwrap`); `kspl_check_fail` is the C runtime's (an index, a division by zero, a shift).
PANIC_STOPS = ("kspl_std_lang_panic", "kspl_check_fail")
# The frames the backtrace leaves out: the panic's own plumbing under the user's frame.
PANIC_FRAMES = ("kspl_std_lang_panic", "kspl_std_lang_bounds_panic", "kspl_check_fail",
                "kspl_bounds_fail", "kspl_div_fail", "kspl_shift_fail", "kspl_tag_fail", "abort",
                "raise", "pthread_kill")

# An enum's cases, in the order `std/lang.kspl` declares them. Used where the debug information
# has no names for them (below).
STD_ENUM_CASES = {"Option": ("some", "none"), "Result": ("ok", "err")}


def safe_get_unsigned(valobj, name, default=0):
    try:
        child = valobj.GetChildMemberWithName(name)
        if child and child.IsValid():
            return child.GetValueAsUnsigned(default)
    except Exception:
        pass
    return default


def _field_names(sbtype):
    t = sbtype.GetCanonicalType()
    return [t.GetFieldAtIndex(i).GetName() for i in range(t.GetNumberOfFields())]


# Whether this is a compiler temporary holding an intermediate result (a method chain and the
# like) rather than a name from the source. The naming convention is in `ksplc/lower/`.
_compiler_temp_re = re.compile(r'^_mir_tmp_\d+$')


def is_compiler_temp(valobj):
    return bool(_compiler_temp_re.match(valobj.GetName() or ""))


def format_summary(valobj, content):
    kspl_type = demangle(valobj.GetTypeName())
    # ⚙ tells it apart from a user's variable (only on a local directly under the frame in VS
    # Code's Variables panel, not on a nested field).
    prefix = "⚙ " if is_compiler_temp(valobj) else ""
    if content == "":
        return f"{prefix}({kspl_type})"
    return f"{prefix}({kspl_type}) {content}"


def _is_text(slice_obj):
    ptr = slice_obj.GetChildMemberWithName("ptr")
    if not ptr or not ptr.IsValid():
        return False
    item = ptr.GetType().GetPointeeType().GetUnqualifiedType().GetName()
    return item == "U8"


def get_slice_str(slice_obj):
    if not slice_obj or not slice_obj.IsValid():
        return '""'
    length = safe_get_unsigned(slice_obj, "len")
    ptr = safe_get_unsigned(slice_obj, "ptr")
    if ptr == 0 or length == 0 or length > 0x1000000:
        return '""'
    err = lldb.SBError()
    data = slice_obj.GetProcess().ReadMemory(ptr, min(length, 1024), err)
    if err.Success():
        tail = "…" if length > 1024 else ""
        try:
            return f'"{data.decode("utf-8")}{tail}"'
        except Exception:
            return "(binary)"
    return '""'


# A child's value as text, its own `(type)` left out (it reads inside its parent's summary).
def value_text(child):
    if not child or not child.IsValid():
        return "?"
    if child.GetChildMemberWithName("ptr").IsValid() and \
            child.GetChildMemberWithName("len").IsValid() and _is_text(child):
        return get_slice_str(child)
    text = child.GetSummary() or child.GetValue() or "{...}"
    return re.sub(r'^(⚙ )?\([^)]*\)\s*', '', str(text))


def kspl_slice_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        len_val = safe_get_unsigned(valobj, "len")
        ptr_val = safe_get_unsigned(valobj, "ptr")
        text = _is_text(valobj)
        if len_val == 0:
            return format_summary(valobj, '""' if text else '[]')
        if ptr_val == 0 or len_val > 0x1000000:
            return format_summary(valobj, "<uninitialized>")
        if text:
            return format_summary(valobj, get_slice_str(valobj))
        return format_summary(valobj, f"len={len_val}")
    except Exception:
        return format_summary(valobj, "invalid")


def kspl_builder_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        len_val = safe_get_unsigned(valobj, "len")
        cap_val = safe_get_unsigned(valobj, "cap")
        ptr_val = safe_get_unsigned(valobj, "ptr")
        if len_val == 0:
            return format_summary(valobj, '""')
        if ptr_val == 0 or len_val > 0x1000000:
            return format_summary(valobj, "<uninitialized>")
        return format_summary(valobj, f'{get_slice_str(valobj)} (cap: {cap_val})')
    except Exception:
        return format_summary(valobj, "invalid builder")


def kspl_list_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        return format_summary(valobj, f"len={safe_get_unsigned(valobj, 'len')}, "
                                      f"cap={safe_get_unsigned(valobj, 'cap')}")
    except Exception:
        return format_summary(valobj, "")


def _is_map_entry(valobj):
    return valobj.GetChildMemberWithName("is_active").IsValid()


def kspl_map_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    if _is_map_entry(valobj):
        return kspl_map_entry_summary(valobj, internal_dict)
    try:
        return format_summary(valobj, f"entries={safe_get_unsigned(valobj, 'len')}, "
                                      f"cap={safe_get_unsigned(valobj, 'cap')}")
    except Exception:
        return format_summary(valobj, "")


def kspl_map_entry_summary(valobj, internal_dict):
    try:
        if not safe_get_unsigned(valobj, "is_active"):
            return "inactive"
        key = value_text(valobj.GetChildMemberWithName("key"))
        val = value_text(valobj.GetChildMemberWithName("value"))
        return f'{key}: {val}'
    except Exception:
        return "invalid entry"


def kspl_ast_node_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        kind = value_text(valobj.GetChildMemberWithName("kind_id"))
        text_str = get_slice_str(valobj.GetChildMemberWithName("text"))
        return format_summary(valobj, f"[{kind}] {text_str}")
    except Exception:
        return format_summary(valobj, "")


# ------------------------------------------
# Enums: the case's name
# ------------------------------------------
# An enum is `struct { I32 tag; union { … } payload; }`, or a plain `I32` where no case holds a
# payload. **The tag is a plain `I32`**, so its type names no case. genc writes the cases as the
# enumerators `kspl_<C type name>_<case>`, and they are looked up here by that name.
# Caution: **clang leaves an enum out of the debug information when no variable has its type**,
# which is the case for most of them. `ksplc build` passes `-fno-eliminate-unused-debug-types`
# to keep them; a program built another way may show only the number (`tag=1`). `Option` and
# `Result` still show theirs, from `STD_ENUM_CASES`.

_enum_index = {}   # the module's UUID -> [{value: name}] for each enum of `kspl_` enumerators
_enum_cases = {}   # (UUID, C type name) -> {value: case}, or None where none is known


def _target_key(valobj):
    target = valobj.GetTarget()
    module = target.GetModuleAtIndex(0)
    return module.GetUUIDString() or str(module.GetFileSpec())


def _all_kspl_enums(valobj):
    key = _target_key(valobj)
    if key in _enum_index:
        return key, _enum_index[key]
    found = []
    target = valobj.GetTarget()
    for m in range(target.GetNumModules()):
        types = target.GetModuleAtIndex(m).GetTypes(lldb.eTypeClassEnumeration)
        for i in range(types.GetSize()):
            members = types.GetTypeAtIndex(i).GetEnumMembers()
            names = {}
            for j in range(members.GetSize()):
                e = members.GetTypeEnumMemberAtIndex(j)
                names[e.GetValueAsSigned()] = e.GetName()
            if names and all(n.startswith("kspl_") for n in names.values()):
                found.append(names)
    _enum_index[key] = found
    return key, found


_case_re = re.compile(r'^[a-z][a-z0-9_]*$')


def enum_cases(valobj, type_name):
    key, enums = _all_kspl_enums(valobj)
    if (key, type_name) in _enum_cases:
        return _enum_cases[(key, type_name)]
    prefix = "kspl_" + type_name + "_"
    cases = None
    for names in enums:
        rests = {v: n[len(prefix):] for v, n in names.items() if n.startswith(prefix)}
        # A case is lower case: `kspl_Option_U8_Ptr_some` is not a case of `Option_U8`.
        if len(rests) == len(names) and all(_case_re.match(r) for r in rests.values()):
            cases = rests
            break
    if cases is None:
        for generic, names in STD_ENUM_CASES.items():
            if type_name.startswith(generic + "_"):
                cases = dict(enumerate(names))
    _enum_cases[(key, type_name)] = cases
    return cases


def _c_type_name(valobj):
    return valobj.GetType().GetUnqualifiedType().GetName().replace("struct ", "")


def is_kspl_enum(sbtype, internal_dict):
    t = sbtype.GetCanonicalType()
    if t.GetTypeClass() != lldb.eTypeClassStruct:
        return False
    fields = _field_names(t)
    return fields in (["tag"], ["tag", "payload"])


def kspl_enum_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        tag = valobj.GetChildMemberWithName("tag").GetValueAsSigned(0)
        cases = enum_cases(valobj, _c_type_name(valobj).replace(" ", "")) or {}
        case = cases.get(tag)
        if case is None:
            return format_summary(valobj, f"tag={tag}")
        payload = valobj.GetChildMemberWithName("payload").GetChildMemberWithName(case)
        if not payload or not payload.IsValid() or payload.GetNumChildren() == 0:
            return format_summary(valobj, f".{case}")
        fields = [payload.GetChildAtIndex(i) for i in range(payload.GetNumChildren())]
        # `Option` and `Result` hold one unnamed value (`value` / `error` in C).
        if len(fields) == 1 and fields[0].GetName() in ("value", "error"):
            return format_summary(valobj, f".{case}({value_text(fields[0])})")
        inner = ", ".join(f"{f.GetName()}: {value_text(f)}" for f in fields)
        return format_summary(valobj, f".{case}({inner})")
    except Exception:
        return format_summary(valobj, "invalid enum")


# An enum with no payload is a typedef of `I32`; it is told apart by having enumerators.
# Caution: **LLDB offers each name down a typedef's chain**, `int32_t` under `I32` too. So the name
# must be a KSPL type's: a capital opens a word after the file path.
_kspl_type_re = re.compile(r'^([a-z0-9]+_)*[A-Z][A-Za-z0-9_]*$')


def is_kspl_plain_enum(sbtype, internal_dict):
    name = sbtype.GetName()
    if not sbtype.IsTypedefType() or name in BUILTIN_TYPES or not _kspl_type_re.match(name):
        return False
    basic = sbtype.GetCanonicalType().GetBasicType()
    return basic == lldb.eBasicTypeInt


def kspl_plain_enum_summary(valobj, internal_dict):
    try:
        cases = enum_cases(valobj, valobj.GetType().GetName())
        case = (cases or {}).get(valobj.GetValueAsSigned(0))
        return f".{case}" if case else ""
    except Exception:
        return ""


# ------------------------------------------
# Trait values
# ------------------------------------------
# A trait's value is `{void *obj; const struct kspl_vtable_X *vtable;}` (`emit_trait_decl` in
# `ksplc/gen/c/types.kspl`). The implementing type is read from the symbol the vtable pointer
# points at (`kspl_vtable_impl_std_str_Str_builder_Writer`).
def is_kspl_trait(sbtype, internal_dict):
    t = sbtype.GetCanonicalType()
    return t.GetTypeClass() == lldb.eTypeClassStruct and _field_names(t) == ["obj", "vtable"]


def kspl_trait_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        obj_addr = safe_get_unsigned(valobj, "obj")
        vtable_addr = safe_get_unsigned(valobj, "vtable")
        if obj_addr == 0 and vtable_addr == 0:
            return format_summary(valobj, "<uninitialized>")
        impl_name = "?"
        if vtable_addr != 0:
            addr = valobj.GetProcess().GetTarget().ResolveLoadAddress(vtable_addr)
            sym = addr.GetSymbol()
            if sym and sym.IsValid():
                sym_name = sym.GetName()
                prefix = "kspl_vtable_impl_"
                suffix = "_" + _c_type_name(valobj)
                if sym_name.startswith(prefix):
                    sym_name = sym_name[len(prefix):]
                if sym_name.endswith(suffix):
                    sym_name = sym_name[:-len(suffix)]
                impl_name = demangle(sym_name)
        return format_summary(valobj, f"impl={impl_name}")
    except Exception:
        return format_summary(valobj, "invalid trait")


# ------------------------------------------
# Children: a slice's and a list's items, a map's entries
# ------------------------------------------
class KsplSliceSyntheticProvider:
    def __init__(self, valobj, internal_dict):
        self.valobj = valobj.GetNonSyntheticValue()
        self.update()

    def num_children(self):
        return self.length

    def get_child_index(self, name):
        try:
            return int(name.strip('[]'))
        except Exception:
            return -1

    def get_child_at_index(self, index):
        if index < 0 or index >= self.num_children():
            return None
        try:
            base_addr = self.ptr.GetValueAsUnsigned(0)
            if base_addr == 0:
                return None
            target_addr = base_addr + index * self.item_size
            return self.valobj.CreateValueFromAddress(f"[{index}]", target_addr, self.item_type)
        except Exception:
            return None

    def update(self):
        try:
            self.length = safe_get_unsigned(self.valobj, "len")
            if self.length > 10000:
                self.length = 0
            self.ptr = self.valobj.GetChildMemberWithName("ptr")
            ptr_type = self.ptr.GetType()
            self.item_type = ptr_type.GetPointeeType() if ptr_type.IsPointerType() else ptr_type
            self.item_size = max(self.item_type.GetByteSize(), 1)
        except Exception:
            self.length = 0

    def has_children(self):
        return self.length > 0


class KsplMapSyntheticProvider:
    def __init__(self, valobj, internal_dict):
        self.valobj = valobj.GetNonSyntheticValue()
        self.update()

    def num_children(self):
        if self.entry:
            return self.valobj.GetNumChildren()
        return len(self.active_indices)

    def get_child_index(self, name):
        return -1

    def get_child_at_index(self, index):
        if self.entry:
            return self.valobj.GetChildAtIndex(index)
        if index < 0 or index >= len(self.active_indices):
            return None
        try:
            idx = self.active_indices[index]
            base_addr = self.entries_ptr.GetValueAsUnsigned(0)
            if base_addr == 0:
                return None
            target_addr = base_addr + idx * self.entry_size
            return self.valobj.CreateValueFromAddress(f"[{index}]", target_addr, self.entry_type)
        except Exception:
            return None

    def update(self):
        self.active_indices = []
        self.entry = _is_map_entry(self.valobj)
        if self.entry:
            return
        try:
            cap = safe_get_unsigned(self.valobj, "cap")
            self.entries_ptr = self.valobj.GetChildMemberWithName("entries")
            if cap > 0 and self.entries_ptr and self.entries_ptr.GetValueAsUnsigned(0) != 0:
                ptr_type = self.entries_ptr.GetType()
                self.entry_type = ptr_type.GetPointeeType() if ptr_type.IsPointerType() \
                    else ptr_type
                self.entry_size = max(self.entry_type.GetByteSize(), 1)
                for i in range(min(cap, 10000)):
                    entry = self.entries_ptr.CreateChildAtOffset("t", i * self.entry_size,
                                                                 self.entry_type)
                    if safe_get_unsigned(entry, "is_active"):
                        self.active_indices.append(i)
        except Exception:
            pass

    def has_children(self):
        return self.num_children() > 0


# ------------------------------------------
# The panic stop
# ------------------------------------------
_std_path_re = re.compile(r'(^|[/\\])std[/\\]')


def panic_breakpoint_callback(frame, bp_loc, internal_dict):
    thread = frame.GetThread()
    bt_str = "\n" + "═" * 60 + "\n 🚨 [Kanso] Panic Intercepted!\n" + "═" * 60 + \
        "\n --- Call Stack ---\n"
    kspl_count = 0
    for i in range(thread.GetNumFrames()):
        f = thread.GetFrameAtIndex(i)
        func_name = f.GetFunctionName() or "Unknown"
        line_entry = f.GetLineEntry()
        filename = line_entry.GetFileSpec().GetFilename() or ""
        line = line_entry.GetLine()
        # Hides the panic plumbing frames so the backtrace starts at the user's own frame.
        if any(func_name == p or func_name.startswith(p + "@") for p in PANIC_FRAMES):
            continue
        bt_str += f"  ${kspl_count:<2} {demangle_fn(func_name)}() at {filename}:{line}\n"
        kspl_count += 1
    bt_str += "═" * 60 + "\n"
    print(bt_str, flush=True)
    idx = _user_frame_index(thread)
    if idx != -1:
        thread.SetSelectedFrame(idx)
    return True


def _user_frame_index(thread):
    """The first frame in a KSPL source outside std, or -1 where there is none."""
    for i in range(thread.GetNumFrames()):
        f = thread.GetFrameAtIndex(i)
        func_name = f.GetFunctionName() or ""
        if any(func_name == p or func_name.startswith(p + "@") for p in PANIC_FRAMES):
            continue
        spec = f.GetLineEntry().GetFileSpec()
        if (spec.GetFilename() or "").endswith(".kspl") and not _std_path_re.search(str(spec)):
            return i
    return -1


class PanicStopHook:
    """Selects the user's frame once the process has stopped at a panic stop.

    Caution: **Select it here as well as in the breakpoint's callback.** LLDB 22 picks the frame
    to show after the callback has run, so the frame the callback selected is lost. A stop hook
    runs once that choice is made, and LLDB 18 honours either.
    """

    def __init__(self, target, extra_args, internal_dict):
        pass

    def handle_stop(self, exe_ctx, stream):
        thread = exe_ctx.GetThread()
        if not thread.IsValid() or thread.GetNumFrames() == 0:
            return True
        top = thread.GetFrameAtIndex(0).GetFunctionName() or ""
        if not any(top == p or top.startswith(p + "@") for p in PANIC_STOPS):
            return True
        idx = _user_frame_index(thread)
        if idx != -1:
            thread.SetSelectedFrame(idx)
        return True


def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('type summary clear')
    debugger.HandleCommand('type synthetic clear')
    for fn, pattern, _fields in SUMMARY_PATTERNS:
        debugger.HandleCommand(f'type summary add -F kspl_lldb.{fn} -e -x "{pattern}"')
    # An enum and a trait value are known by their fields, since their names follow no pattern.
    for fn, test in (("kspl_enum_summary", "is_kspl_enum"),
                     ("kspl_plain_enum_summary", "is_kspl_plain_enum"),
                     ("kspl_trait_summary", "is_kspl_trait")):
        debugger.HandleCommand(
            f'type summary add -F kspl_lldb.{fn} -e --recognizer-function kspl_lldb.{test}')
    for cls, pattern in SYNTHETIC_PATTERNS:
        debugger.HandleCommand(f'type synthetic add -x "{pattern}" --python-class kspl_lldb.{cls}')
    for name in PANIC_STOPS:
        debugger.HandleCommand(f'breakpoint set -n {name} -N KansoPanic')
    debugger.HandleCommand('target stop-hook add -P kspl_lldb.PanicStopHook')
    debugger.HandleCommand(
        'breakpoint command add -F kspl_lldb.panic_breakpoint_callback KansoPanic')
    print("[Kanso] LLDB Advanced formatters & Demangler loaded.", flush=True)


# ------------------------------------------
# The self-test
# ------------------------------------------
# Caution: **The mark for a failure is `FAIL`** (the source is the table in
# `tests/support/conventions_line.kspl`).
# `mk/ci.mk`'s summary picks up that spelling; spelt otherwise, the failure misses the summary.
# This runs outside any KSPL harness, so only the shape of a line is matched.

# Caution: **Take the samples from the generated C.** What rots is the compiler's names changing
# under this side, which a made-up sample cannot notice. `check_c` fails a sample the sample
# program's C does not hold.
DEMANGLE_CASES = [
    ("std_ds_List_I32", "List<|I32|>"),
    ("std_ds_Map_Slice_U8_Const_I32", "Map<|U8[], I32|>"),
    ("std_ds_Map_entry_Slice_U8_Const_I32", "Map_entry<|U8[], I32|>"),
    ("Option_Slice_U8_Const", "U8[]?"),
    ("Option_U8_Ptr", "U8@?"),
    ("Option_std_ds_Map_entry_Slice_U8_Const_I32_Ptr", "Map_entry<|U8[], I32|>@?"),
    ("Result_I32_tools_tests_lldb_sample_Made_err", "I32!Made_err"),
    ("tools_tests_lldb_sample_Shape", "Shape"),
    ("std_str_Str_builder", "Str_builder"),
    ("Slice_U8", "U8[]"),
    ("std_ds_Hashable_Slice_U8_Const", "Hashable<|U8[]|>"),
]

DEMANGLE_FN_CASES = [
    ("kspl_std_lang_bounds_panic", "std.lang.bounds_panic"),
    ("kspl_priv_tools_tests_lldb_sample_stop_here", "priv tools_tests_lldb_sample_stop_here"),
]

SAMPLE = "tools/tests/lldb_sample.kspl"
SAMPLE_STOP = "kspl_priv_tools_tests_lldb_sample_stop_here"

# What `frame variable` shows in the sample's `main`, local by local. `ksplc build` keeps the
# enum `Shape`'s names in the debug information, so its case shows by name.
LLDB_WANTS = [
    ("list", ("(List<|I32|>) len=2",)),
    ("map", ("(Map<|U8[], I32|>) entries=1",)),
    ("builder", ('(Str_builder) "built"',)),
    ("text", ('(U8[]) "hello"',)),
    ("_shape", ("(Shape) .square(side: 2)",)),
    ("bad", ("(I32!Made_err) .err(.too_big)",)),
    ("good", ("(I32!Made_err) .ok(1)",)),
    ("_some_text", ('(U8[]?) .some("abc")',)),
    ("_no_text", ("(U8[]?) .none",)),
    ("_err", (".too_small",)),
]


class _Report:
    def __init__(self):
        self.bad = 0

    def check(self, name, ok, detail=""):
        if ok:
            print("pass " + name)
        else:
            print("FAIL " + name + ("\n       " + detail.replace("\n", "\n       ")
                                    if detail else ""))
            self.bad += 1

    def skip(self, name, why):
        print("SKIP " + name + ": " + why)


def _check_names(rep):
    for got_in, want in DEMANGLE_CASES:
        got = demangle(got_in)
        rep.check("demangle(%s)" % got_in, got == want, "got %r, want %r" % (got, want))
    for got_in, want in DEMANGLE_FN_CASES:
        got = demangle_fn(got_in)
        rep.check("demangle_fn(%s)" % got_in, got == want, "got %r, want %r" % (got, want))


# The structs a C file defines, each with its fields and, for an enum, its payload's cases.
def _c_structs(c_text):
    out = {}
    for m in re.finditer(r'^struct (\w+) \{\n(.*?)^\};', c_text, re.M | re.S):
        fields, cases, depth = [], [], 0
        for line in m.group(2).splitlines():
            s = line.strip()
            closes = s.startswith("}")
            if closes:
                depth -= 1
            name = re.search(r'(\w+)\s*(\[\w*\])?;$', s)
            if name and depth == 0:
                fields.append(name.group(1))
            elif name and closes and depth == 1:
                cases.append(name.group(1))
            if s.endswith("{"):
                depth += 1
        out[m.group(1)] = (fields, cases)
    return out


def check_c(rep, c_text):
    structs = _c_structs(c_text)
    typedefs = set(re.findall(r'^typedef [\w ]+? (\w+);', c_text, re.M))
    for got_in, _want in DEMANGLE_CASES:
        rep.check("the sample's C holds the type %s" % got_in, got_in in typedefs | set(structs))
    for fn, pattern, needs in SUMMARY_PATTERNS:
        if fn == "kspl_ast_node_summary":
            continue
        hits = [n for n in structs if re.match(pattern, n)]
        wrong = [n for n in hits
                 if not any(all(f in structs[n][0] for f in alt) for alt in needs)]
        rep.check("%s's pattern matches the sample's C, every match with the fields %s"
                  % (fn, " or ".join(", ".join(alt) for alt in needs)), hits and not wrong,
                  "matches: %s; without those fields: %s" % (hits, wrong))
    enums = {n: v for n, v in structs.items() if v[0] in (["tag"], ["tag", "payload"])}
    for generic, cases in STD_ENUM_CASES.items():
        names = [n for n in enums if n.startswith(generic + "_")]
        wrong = [n for n in names if not set(enums[n][1]) <= set(cases) or
                 any("kspl_%s_%s = %d," % (n, c, i) not in c_text for i, c in enumerate(cases))]
        rep.check("every %s in the sample's C has the cases %s, in that order"
                  % (generic, " ".join(cases)), names and not wrong, "wrong: %s" % wrong)
    for name, cases in (("tools_tests_lldb_sample_Shape", ("circle", "square", "dot")),
                        ("tools_tests_lldb_sample_Made_err", ("too_big", "too_small"))):
        missing = [c for i, c in enumerate(cases) if "kspl_%s_%s = %d," % (name, c, i)
                   not in c_text]
        rep.check("the enumerators of %s are named kspl_<type>_<case>" % name, not missing,
                  "missing: %s" % missing)
    rep.check("an enum's payload holds one member per case with a payload",
              enums.get("tools_tests_lldb_sample_Shape", ([], []))[1] == ["circle", "square"],
              repr(enums.get("tools_tests_lldb_sample_Shape")))
    rep.check("a trait value is obj and vtable", structs.get("Writer", ([],))[0] ==
              ["obj", "vtable"], repr(structs.get("Writer")))
    rep.check("a vtable's symbol is kspl_vtable_impl_<type>_<trait>",
              "kspl_vtable_impl_std_str_Str_builder_Writer" in c_text)
    for stop in PANIC_STOPS:
        rep.check("the panic stop %s is a function in the C" % stop,
                  re.search(r'\bvoid %s\(' % stop, c_text) is not None)
    rep.check("the sample's stop %s is a function in the C" % SAMPLE_STOP,
              re.search(r'\b%s\(I32 x\) \{' % SAMPLE_STOP, c_text) is not None)


# `kspl_ast_node_summary` reads the compiler's own node, which the sample cannot hold.
def check_ast_node(rep, root):
    try:
        with open(os.path.join(root, "ksplc", "base", "ast.kspl"), encoding="utf-8") as f:
            src = f.read()
    except OSError as e:
        rep.skip("Ast_node holds the fields kspl_ast_node_summary reads", str(e))
        return
    m = re.search(r'^struct Ast_node\n((?:    .*\n|\n)+)', src, re.M)
    fields = re.findall(r'^    (\w+):', m.group(1), re.M) if m else []
    rep.check("Ast_node holds the fields kspl_ast_node_summary reads",
              "kind_id" in fields and "text" in fields, "fields: %s" % fields)


def check_lldb(rep, exe):
    me = os.path.abspath(__file__)
    # A container refuses to turn off address randomisation, and the launch would fail on it.
    base = ["lldb", "--batch", "--no-lldbinit", "-o", "command script import " + me,
            "-o", "settings set target.disable-aslr false"]
    stop = subprocess.run(base + ["-o", "breakpoint set -n " + SAMPLE_STOP, "-o", "run",
                                  "-o", "up", "-o", "frame variable", "--", exe],
                          capture_output=True, text=True, timeout=120)
    out = stop.stdout + stop.stderr
    if "stop reason" not in out:
        rep.skip("the printer shows the sample's values in LLDB",
                 "lldb cannot start a process here\n" + out[-800:])
        return
    rep.check("the printer loads in LLDB", "[Kanso] LLDB" in out and "error:" not in out,
              out[-1500:])
    for local, wants in LLDB_WANTS:
        line = next((ln for ln in out.splitlines() if re.search(r'\) %s = ' % local, ln)), "")
        rep.check("LLDB shows %s as %s" % (local, " or ".join(wants)),
                  any(w in line for w in wants),
                  "the line: %r" % line)
    panic = subprocess.run(base + ["-o", "run", "-o", "frame info", "--", exe, "panic"],
                           capture_output=True, text=True, timeout=120)
    out = panic.stdout + panic.stderr
    rep.check("the panic stop fires on an index past the end", "Panic Intercepted" in out,
              out[-1500:])
    rep.check("the panic stop selects the user's frame",
              re.search(r'frame #\d+: .*main.* at lldb_sample\.kspl', out) is not None,
              out[-1500:])


def _selftest():
    rep = _Report()
    _check_names(rep)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    check_ast_node(rep, root)
    exe_ext = ".exe" if os.name == "nt" else ""
    ksplc = os.path.join(root, "out", "ksplc_stage1.exe")
    if not os.path.isfile(ksplc):
        rep.skip("the names against the sample's C", "no compiler at %s (run make)" % ksplc)
        return rep
    with tempfile.TemporaryDirectory() as tmp:
        exe = os.path.join(tmp, "lldb_sample" + exe_ext)
        built = subprocess.run([ksplc, "build", "--cflags=-O0", SAMPLE, exe], cwd=root,
                               capture_output=True, text=True, timeout=240)
        rep.check("the sample builds", built.returncode == 0, built.stdout + built.stderr)
        c_file = os.path.join(tmp, "lldb_sample.c")
        if built.returncode != 0 or not os.path.isfile(c_file):
            return rep
        with open(c_file, encoding="utf-8") as f:
            check_c(rep, f.read())
        if shutil.which("lldb") is None:
            rep.skip("the printer shows the sample's values in LLDB", "lldb is not installed")
        else:
            check_lldb(rep, exe)
    return rep


def selftest():
    rep = _selftest()
    if rep.bad:
        print("RESULT: SOME FAILED (%d)" % rep.bad)
        return 1
    print("RESULT: ALL PASS")
    return 0


# **With no argument it is the self-test**, as in `lib/ksai/tools/*.py`, so the gate running them
# together needs no branch per tool.
if __name__ == "__main__":
    sys.exit(selftest())
