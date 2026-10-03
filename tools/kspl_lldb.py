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
# ==========================================
# Caution: **Keep it loadable where there is no `lldb`**, so the name-conversion self-test
# (`--selftest` below) runs from a bare python3; there only the shape is put in place.
try:
    import lldb
except ImportError:
    lldb = None
import re

# The files' logical names. genc crushes `.` into `_`, so a list is needed to put it back.
# Caution: **Both the types and the functions use this.** Split it and a file's types get their
# names back while its functions do not (or the reverse).
MODULE_DOTS = [
    ("std_ds_", "std.ds."), ("std_io_", "std.io."), ("std_mem_", "std.mem."),
    ("std_str_", "std.str."), ("std_sys_", "std.sys."), ("std_os_", "std.os."),
    ("std_lang_", "std.lang."), ("std_seq_", "std.seq."),
    ("ksplc_", "ksplc."),
    ("sema_scope_", "sema.scope."), ("sema_types_", "sema.types."),
    ("base_ast_", "base.ast."), ("ast_node_", "ast.node."),
]

# The generics' names. genc crushes `List<|I32|>` into `List_I32`.
GENERIC_NAMES = ("List", "Map_entry", "Map", "Arena_list", "Option")


# Puts the generics back into `<| |>`.
# Caution: **Wrap from the right.** Wrapped from the outside, a nested one
# (`Option_std_ds_List_Sz`) loses the inside among the argument's name.
def regenerics(name):
    loop_guard = 0
    while loop_guard < 16:
        loop_guard += 1
        at = -1
        hit = ""
        for g in GENERIC_NAMES:
            for m in re.finditer(re.escape(g) + r'_', name):
                if m.start() > at:
                    at, hit = m.start(), g
        if at < 0:
            return name
        arg = name[at + len(hit) + 1:]
        name = name[:at] + hit + "<|" + arg + "|>"
    return name

# A test's prefix means nothing to the reader, so it is dropped.
TEST_NOISE = (r'^(workspaces_[^_]+_)?tests_[a-zA-Z0-9_]+_', r'^test_[a-zA-Z0-9_]+_')


def undot(name):
    for mangled, dotted in MODULE_DOTS:
        name = name.replace(mangled, dotted)
    return name


def drop_test_noise(name, anchored=True):
    for pat in TEST_NOISE:
        name = re.sub(pat if anchored else pat.lstrip("^"), "", name)
    return name


# Puts the type's own name back.
# Caution: **Look at the longer name first**, or `Slice_U8_Const` crushes into `U8[]` and leaves
# `_Const` behind.
def sigils(name):
    name = re.sub(r'std\.lang\.Slice_([A-Za-z0-9_.]+?)_Const\b', r'const \1[]', name)
    name = re.sub(r'std\.lang\.Slice_([A-Za-z0-9_.]+)', r'\1[]', name)
    name = name.replace("_Ptr", "@")
    # A failable type is spelled `type?error` (the C name carries a `_Result_` in between).
    name = re.sub(r'_Result_([A-Za-z0-9_.]+)', r'?\1', name)
    return name


# Puts a mangled type name back into KSPL's name.
#
# Caution: **Do not swap the order.** Put the file's name back later and the generics' `List_` eats
# the `_` behind `ds_`, leaving `std_ds` joined.
# **`kspl_` is five characters.** Drop four and **every name grows a `_` on its head**, and the
# `Const_` test behind stops matching, so the const mark never comes out.
def demangle(name):
    if not name: return "Unknown"
    name = name.replace("struct ", "").replace("enum ", "").replace("const ", "").strip()

    if name.startswith("kspl_"): name = name[len("kspl_"):]
    name = undot(name)
    name = sigils(name)
    name = drop_test_noise(name)
    # Caution: **Drop it before wrapping the generics**; later it is inside the `<| |>`.
    if name.endswith("_Tag"): name = name[:-len("_Tag")]
    return regenerics(name)


def demangle_fn(name):
    if not name: return "Unknown"
    name = name.replace("kspl_priv_", "priv ").replace("kspl_", "")
    return drop_test_noise(undot(name), anchored=False)


# The self-test. **`lldb` is not needed** (this part looks only at the name conversion).
#
# Caution: **Take the samples from the generated C.** What rots is the compiler's names changing
# under this side, which a made-up sample cannot notice (a slice is `std_lang_Slice_U8`).
DEMANGLE_CASES = [
    ("struct kspl_std_ds_List_I32", "std.ds.List<|I32|>"),
    ("kspl_std_io_Writer", "std.io.Writer"),
    ("kspl_ksplc_base_ast_Ast_node_Ptr", "ksplc.base.ast.Ast_node@"),
    ("kspl_ksplc_base_ast_Ast_node_Ptr_Result_std_ds_Ds_error",
     "ksplc.base.ast.Ast_node@?std.ds.Ds_error"),
    ("kspl_put_std_lang_Writer_std_lang_Slice_U8", "put_std.lang.Writer_U8[]"),
    ("kspl_put_std_lang_Writer_std_lang_Slice_U8_Const", "put_std.lang.Writer_const U8[]"),
    ("kspl_std_lang_Option_std_ds_List_Sz_Ptr_Tag", "std.lang.Option<|std.ds.List<|Sz@|>|>"),
]

DEMANGLE_FN_CASES = [
    ("kspl_priv_std_ds_List_push", "priv std.ds.List_push"),
    ("kspl_std_sys_args", "std.sys.args"),
]


# Caution: **The mark for a failure is `FAIL`** (the source is the table in
# `tests/support/conventions_line.kspls`).
# `mk/ci.mk`'s summary picks up that spelling; spelt otherwise, the failure misses the summary.
# This runs inside LLDB, so a test's harness cannot be borrowed — only the shape is matched.
def _selftest():
    bad = 0
    for got_in, want in DEMANGLE_CASES:
        got = demangle(got_in)
        if got != want:
            print("FAIL demangle(%r)\n       got  %r\n       want %r" % (got_in, got, want))
            bad += 1
        else:
            print("pass demangle(%s)" % got_in)
    for got_in, want in DEMANGLE_FN_CASES:
        got = demangle_fn(got_in)
        if got != want:
            print("FAIL demangle_fn(%r)\n       got  %r\n       want %r" % (got_in, got, want))
            bad += 1
        else:
            print("pass demangle_fn(%s)" % got_in)
    if bad:
        print("RESULT: SOME FAILED (%d)" % bad)
        return 1
    print("RESULT: ALL PASS")
    return 0


def safe_get_unsigned(valobj, name, default=0):
    try:
        child = valobj.GetChildMemberWithName(name)
        if child and child.IsValid(): return child.GetValueAsUnsigned(default)
    except Exception: pass
    return default

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
    if content == "": return f"{prefix}({kspl_type})"
    return f"{prefix}({kspl_type}) {content}"

def get_slice_str(slice_obj):
    if not slice_obj or not slice_obj.IsValid(): return '""'
    length = safe_get_unsigned(slice_obj, "len")
    ptr = safe_get_unsigned(slice_obj, "ptr")
    if ptr == 0 or length == 0 or length > 4096: return '""'
    err = lldb.SBError()
    data = slice_obj.GetProcess().ReadMemory(ptr, min(length, 1024), err)
    if err.Success():
        try: return f'"{data.decode("utf-8")}"'
        except Exception: return "(binary)"
    return '""'

def kspl_slice_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        len_val = safe_get_unsigned(valobj, "len")
        ptr_val = safe_get_unsigned(valobj, "ptr")
        if ptr_val == 0 or len_val > 0x1000000: return format_summary(valobj, "<uninitialized or empty>")
        if len_val == 0: return format_summary(valobj, '""' if 'U8' in valobj.GetTypeName() else '[]')
            
        type_name = valobj.GetTypeName()
        if "U8" in type_name or "Char" in type_name:
            return format_summary(valobj, get_slice_str(valobj))
        return format_summary(valobj, f"len={len_val}")
    except Exception: return format_summary(valobj, "invalid")

def kspl_result_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        if safe_get_unsigned(valobj, "is_err"):
            return format_summary(valobj, f"fail {safe_get_unsigned(valobj, 'error_code')}")
        val = valobj.GetChildMemberWithName("val")
        return format_summary(valobj, f"ok {val.GetSummary() or val.GetValue()}" if val and val.IsValid() else "ok")
    except Exception: return format_summary(valobj, "invalid result")

def kspl_builder_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        len_val = safe_get_unsigned(valobj, "len")
        cap_val = safe_get_unsigned(valobj, "cap")
        ptr_val = safe_get_unsigned(valobj, "ptr")
        if ptr_val == 0 or len_val > 0x1000000: return format_summary(valobj, "<uninitialized or empty>")
        if len_val == 0: return format_summary(valobj, '""')
            
        error = lldb.SBError()
        data = valobj.GetProcess().ReadMemory(ptr_val, min(len_val, 1024), error)
        if error.Success():
            try: return format_summary(valobj, f'"{data.decode("utf-8")}" (cap: {cap_val})')
            except Exception: pass
        return format_summary(valobj, f"len={len_val}, cap={cap_val}")
    except Exception: return format_summary(valobj, "invalid builder")

def kspl_list_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try: return format_summary(valobj, f"len={safe_get_unsigned(valobj, 'len')}, cap={safe_get_unsigned(valobj, 'cap')}")
    except Exception: return format_summary(valobj, "")

def kspl_map_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    if "Map_entry" in valobj.GetTypeName(): return ""
    try: return format_summary(valobj, f"entries={safe_get_unsigned(valobj, 'len')}, cap={safe_get_unsigned(valobj, 'cap')}")
    except Exception: return format_summary(valobj, "")

def kspl_map_entry_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        is_active = safe_get_unsigned(valobj, "is_active")
        if not is_active: return "inactive"
        key_val = valobj.GetChildMemberWithName("key")
        val_val = valobj.GetChildMemberWithName("value")
        key_str = get_slice_str(key_val).strip('"') or "unknown"
        val_str = val_val.GetSummary() or val_val.GetValue() or "{...}"
        val_str = re.sub(r'^\([^)]+\)\s*', '', str(val_str))
        return f'"{key_str}": {val_str}'
    except Exception: return "invalid entry"

def kspl_ast_node_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        kind_id = safe_get_unsigned(valobj, "kind_id")
        text_str = get_slice_str(valobj.GetChildMemberWithName("text")).strip('"')
        return format_summary(valobj, f"[kind_id:{kind_id}] '{text_str}'")
    except Exception: pass
    return format_summary(valobj, "")

# How a trait's value is represented ({obj: void*, vtable: const kspl_vtable_X*}; see
# `emit_trait_decl` in `ksplc/gen/c/types.kspls`). Unlike a vtable type, this struct itself
# carries no "kspl_" prefix, so it matches none of the other type summary patterns
# (kspl_struct_summary and the rest). It works the implementing type's name back out of the symbol
# name the vtable pointer points at (for example kspl_vtable_impl_std_io_File_stream_std_io_Writer)
# and shows which type actually implements this trait value.
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
                suffix = "_" + valobj.GetTypeName()
                if sym_name.startswith(prefix):
                    sym_name = sym_name[len(prefix):]
                if sym_name.endswith(suffix):
                    sym_name = sym_name[:-len(suffix)]
                impl_name = demangle(sym_name)
        return format_summary(valobj, f"impl={impl_name}")
    except Exception: return format_summary(valobj, "invalid trait")

def kspl_struct_summary(valobj, internal_dict):
    valobj = valobj.GetNonSyntheticValue()
    try:
        tag_val = valobj.GetChildMemberWithName("tag")
        if tag_val and tag_val.IsValid():
            tag_str = tag_val.GetValue()
            if tag_str:
                if not str(tag_str).isdigit():
                    tag_name = str(tag_str).split("_")[-1]
                else:
                    tag_num = tag_val.GetValueAsUnsigned(0)
                    enum_type = tag_val.GetType()
                    tag_name = "unknown"
                    for i in range(enum_type.GetNumEnumMembers()):
                        enum_member = enum_type.GetEnumMemberAtIndex(i)
                        if enum_member.GetValueAsUnsigned() == tag_num:
                            tag_name = enum_member.GetName().split("_")[-1]
                            break
                            
                payload_val = valobj.GetChildMemberWithName("payload")
                if payload_val and payload_val.IsValid():
                    v_payload = payload_val.GetChildMemberWithName(tag_name)
                    if v_payload and v_payload.IsValid() and v_payload.GetNumChildren() > 0:
                        fields = []
                        for i in range(v_payload.GetNumChildren()):
                            child = v_payload.GetChildAtIndex(i)
                            if "slice_const_u8" in child.GetTypeName() or "slice_u8" in child.GetTypeName() or "U8[]" in child.GetTypeName() or "U8_Slice" in child.GetTypeName():
                                val_str = get_slice_str(child)
                            else:
                                val_str = child.GetSummary() or child.GetValue() or "{...}"
                            val_str = re.sub(r'^\([^)]+\)\s*', '', str(val_str))
                            fields.append(f"{child.GetName()}: {val_str}")
                        return format_summary(valobj, f".{tag_name}({', '.join(fields)})")
                return format_summary(valobj, f".{tag_name}")
    except Exception: pass
    return format_summary(valobj, "")

class KsplSliceSyntheticProvider:
    def __init__(self, valobj, internal_dict):
        self.valobj = valobj.GetNonSyntheticValue()
        self.update()
    def num_children(self): return self.length
    def get_child_index(self, name):
        try: return int(name.strip('[]'))
        except Exception: return -1
    def get_child_at_index(self, index):
        if index < 0 or index >= self.num_children(): return None
        try:
            base_addr = self.ptr.GetValueAsUnsigned(0)
            if base_addr == 0: return None
            target_addr = base_addr + index * self.item_size
            return self.valobj.CreateValueFromAddress(f"[{index}]", target_addr, self.item_type)
        except Exception: return None
    def update(self):
        try:
            self.length = safe_get_unsigned(self.valobj, "len")
            if self.length > 10000: self.length = 0
            self.ptr = self.valobj.GetChildMemberWithName("ptr")
            ptr_type = self.ptr.GetType()
            self.item_type = ptr_type.GetPointeeType() if ptr_type.IsPointerType() else ptr_type
            self.item_size = max(self.item_type.GetByteSize(), 1)
        except Exception: self.length = 0
    def has_children(self): return self.length > 0

class KsplMapSyntheticProvider:
    def __init__(self, valobj, internal_dict):
        self.valobj = valobj.GetNonSyntheticValue()
        self.update()
    def num_children(self): return len(self.active_indices)
    def get_child_index(self, name): return -1
    def get_child_at_index(self, index):
        if index < 0 or index >= self.num_children(): return None
        try:
            idx = self.active_indices[index]
            base_addr = self.entries_ptr.GetValueAsUnsigned(0)
            if base_addr == 0: return None
            target_addr = base_addr + idx * self.entry_size
            return self.valobj.CreateValueFromAddress(f"[{index}]", target_addr, self.entry_type)
        except Exception: return None
    def update(self):
        self.active_indices = []
        try:
            if "Map_entry" in self.valobj.GetTypeName(): return
            cap = safe_get_unsigned(self.valobj, "cap")
            self.entries_ptr = self.valobj.GetChildMemberWithName("entries")
            if cap > 0 and self.entries_ptr and self.entries_ptr.GetValueAsUnsigned(0) != 0:
                ptr_type = self.entries_ptr.GetType()
                self.entry_type = ptr_type.GetPointeeType() if ptr_type.IsPointerType() else ptr_type
                self.entry_size = max(self.entry_type.GetByteSize(), 1)
                for i in range(min(cap, 10000)):
                    entry = self.entries_ptr.CreateChildAtOffset("t", i * self.entry_size, self.entry_type)
                    if safe_get_unsigned(entry, "is_active"):
                        self.active_indices.append(i)
        except Exception: pass
    def has_children(self): return len(self.active_indices) > 0

def panic_breakpoint_callback(frame, bp_loc, dict):
    thread = frame.GetThread()
    bt_str = "\n" + "═"*60 + "\n 🚨 [Kanso] Panic Intercepted!\n" + "═"*60 + "\n --- Call Stack ---\n"
    
    kspl_count = 0
    kspl_frame_idx = -1
    for i in range(thread.GetNumFrames()):
        f = thread.GetFrameAtIndex(i)
        func_name = f.GetFunctionName() or "Unknown"
        line_entry = f.GetLineEntry()
        filename = line_entry.GetFileSpec().GetFilename() or ""
        line = line_entry.GetLine()
        
        # Hides the panic plumbing frames so the backtrace starts at the user's own frame.
        if "bounds_panic" in func_name or "sys_panic" in func_name or "abort" in func_name:
            continue
            
        demangled = demangle_fn(func_name)
        bt_str += f"  ${kspl_count:<2} {demangled}() at {filename}:{line}\n"
        kspl_count += 1
        
        # Both notations: a file written in braces is the user's too. A suffix test on ".kspl"
        # alone passes over every ".kspls" and lands the selection on a std frame.
        if filename.endswith((".kspl", ".kspls")) and kspl_frame_idx == -1:
            kspl_frame_idx = i
            
    bt_str += "═"*60 + "\n"
    print(bt_str, flush=True)
    
    if kspl_frame_idx != -1:
        thread.SetSelectedFrame(kspl_frame_idx)
        
    return True

def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('type summary clear')
    debugger.HandleCommand('type synthetic clear')
    
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_slice_summary -e -x ".*(slice|Slice).*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_result_summary -e -x ".*Result_.*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_builder_summary -e -x ".*Builder.*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_list_summary -e -x ".*List_.*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_list_summary -e -x ".*Arena_list_.*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_map_summary -e -x ".*Map_.*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_map_entry_summary -e -x ".*Map_entry.*"')
    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_ast_node_summary -e -x ".*Ast_node.*"')

    # A trait value carries no "kspl_" prefix (the head of `kspl_trait_summary`). LLDB's regex has
    # no negative lookahead, so to miss "kspl_vtable_..." the known files' logical names are listed
    # one by one (a user-defined trait is not covered).
    debugger.HandleCommand(
        'type summary add -F kspl_lldb.kspl_trait_summary -e -x '
        '"^(std_io_|std_ds_|std_operator_)?(Writer|Reader|Closer|Formattable|Iterator|Add|Sub|Mul|Div|Neg|Not|Eq|Ord|Index|Index_mut)(_[A-Za-z0-9_]+)?$"')

    debugger.HandleCommand('type summary add -F kspl_lldb.kspl_struct_summary -e -x "^(struct )?kspl_.*"')
    
    debugger.HandleCommand('type synthetic add -x ".*(slice|Slice|List_|_list_).*" --python-class kspl_lldb.KsplSliceSyntheticProvider')
    debugger.HandleCommand('type synthetic add -x ".*Map_.*" --python-class kspl_lldb.KsplMapSyntheticProvider')
    
    debugger.HandleCommand('breakpoint set -n kspl_std_sys_panic -N KansoPanic -C "script kspl_lldb.panic_breakpoint_callback(frame, bp_loc, internal_dict)"')
    debugger.HandleCommand('breakpoint set -n kspl_priv_std_ds_bounds_panic -N KansoPanic -C "script kspl_lldb.panic_breakpoint_callback(frame, bp_loc, internal_dict)"')
    
    print("[Kanso] LLDB Advanced formatters & Demangler loaded.", flush=True)


# **With no argument it is the self-test**, as in `tools/ai_assist/*.py`, so the gate running them
# together needs no branch per tool.
# **It looks only at the name conversion**; readability inside LLDB needs a debugger.
if __name__ == "__main__":
    import sys as _sys
    _sys.exit(_selftest())
