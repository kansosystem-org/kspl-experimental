# How ksai serves a chat model

This document gives the reasons behind `chat_server`, the example that serves a Qwen3-Instruct-2507 or Qwen3.5 model over HTTP, from its GGUF file. It is for whoever changes the server. How to start it is in "The chat server" in [ksai](../README.md). The code is in [`../examples/chat_server/`](../examples/chat_server/main.kspl).

Words used here: a *marker* is a token the template writes by its ID, such as `<|im_start|>`. The *cache* is the model's keys and values for each position it has read. A *client* is the program that sends the requests, such as ksagent.

## What it is for

**The server lets a client with tools run with no model server from outside.** It answers `POST /v1/chat/completions` in the OpenAI style, with `tools`, and without streaming. That is the one protocol many local model servers share. So a client written for them needs no change.

**It is an example of the package, not a library.** It joins ksai's own parts: the GGUF reader, the Qwen model (`Qwen` in [`../qwen.kspl`](../qwen.kspl)), the tokenizer and the sampler. It imports that model rather than holding a copy.

## Everything comes from one GGUF file

**`chat_server <model.gguf>` reads the weights, the vocabulary and the chat template from the one file** that llama.cpp runs too. So the server and llama.cpp cannot be handed parts of two models.

* **The weights are used where they lie** in the file's bytes, read once into memory. The reasons are in "A GGUF file is read once and used in place" in [`DESIGN-learning.md`](DESIGN-learning.md).
* **The vocabulary** is the file's `tokenizer.ggml.tokens`, `.merges` and `.token_type`, made into a tokenizer by `Tokenizer.load_lists`. Only GPT-2's byte-level kind is read, with the splitting rule the file names: Qwen2's (`qwen2`) or Qwen3.5's (`qwen35`). Another is refused at start.
* **The chat template** is the file's `tokenizer.chat_template`. It is not run. The server renders its own copy of it, tied to the file's text by a hash ("The chat template is kept in one place" below).

**The memory is the file plus the cache.** The cache holds every position's keys and values in F32: for Qwen3-4B, 36 layers × 2 × 8 heads × 128 numbers × 4 bytes, or 288 KiB a token. Qwen3.5-9B attends in 8 of its 32 blocks, so its cache takes 64 KiB a token: 1 GiB at the default context, beside its 4.7 GB file. Its other blocks keep a running state of about 50 MiB in all. The server keeps four copies of it ("The cache is kept across requests" below).

| `--context` | The cache | With the 2.5 GB file |
| :-- | :-- | :-- |
| 16384, the default | 4.5 GiB | about 7 GB |
| 32768 | 9 GiB | about 11.5 GB |

**The default is 16384 tokens.** It leaves room on a machine of 16 GB, and holds a long search by ksagent. ksagent's own cap on a request, 192 KiB, is about 50 000 tokens, so a larger `--context` serves longer searches. `--context` cannot exceed the context the model was trained on, `<arch>.context_length`. On Linux the system gives the cache's memory as the conversation fills it, so a short conversation takes less.

## It listens on the loopback only

**The server listens on `127.0.0.1` and has no option to listen elsewhere.** It has no accounts, no keys and no encryption:

* **Anyone who reaches the port can make it work**, and one answer can hold a CPU core for minutes.
* **The conversation travels as plain text.** A client sends the files it read, which can be confidential.

A server for other machines needs all three. That is a separate decision, with its own rules for who may ask.

## One request at a time

**The server reads, answers and closes one connection before it accepts the next.** Other connections wait in the operating system's queue.

* **The model has one cache.** Two requests at once would need a cache each, which doubles the memory. They would also lose the reuse below, since each would overwrite the shared start.
* **One request already keeps every core busy.** A second one makes both slower, and neither finishes sooner.
* **A request has a time limit for arriving and for leaving.** It must arrive whole within 30 seconds, and its answer must leave within 30 seconds. A client that stops halfway therefore cannot hold the server.

**The price is a wait.** A second client waits until the first answer is written. The generation itself has no time limit, since a slow CPU is no fault of the client.

## The chat template is kept in one place

**The template is the text the model was trained to read around each message.** A model reads a conversation only in its own template. A template that differs by one line break gives worse answers, with no error anywhere.

**[`../examples/chat_server/template.kspl`](../examples/chat_server/template.kspl) follows the chat template of Qwen3-4B-Instruct-2507's GGUF file, and [`../examples/chat_server/template35.kspl`](../examples/chat_server/template35.kspl) that of Qwen3.5-9B's.** Each file writes each branch in its template's order, with the fixed text as constants at the top. So each can be compared with its template line by line, and a fix is made in that file alone. The conversation, the markers and the builder of the token IDs are `template.kspl`'s, and both use them.

**The server does not run the file's template; it checks it.** Running it would need a Jinja interpreter in KSPL, a language of its own with loops, filters and Python's string methods. Instead each `matches` compares the SHA-256 of the file's text with the one its `render` follows. The server refuses at start a file whose template is neither. So a template changed by one character is refused, rather than rendered by stale code with no error.

* **Tools go into the system message** as JSON inside `<tools></tools>`, after the request's own system text, with the instruction to answer in `<tool_call>` blocks. Without tools, a system message stands alone, and no system text is added where the request has none.
* **An assistant message's tool calls are written back as `<tool_call>` blocks.** Arguments that come as JSON text are written as that text. Arguments that come as an object are written as the template's `tojson` writes them.
* **Consecutive tool results share one user turn**, each inside `<tool_response>`.
* **The model's thinking is kept only after the last question.** An assistant message after the last user message gets a `<think>` block in two cases. It is the last message, or it brings its thinking (`reasoning_content`, or a `</think>` in its text). A user message wrapped whole in `<tool_response>` is a tool's result, not a question.
* **`tojson` writes JSON as Python's `json.dumps` does**: a space after each `,` and `:`, and non-ASCII text as it is (`template.tojson`). The members keep the order the request gave them.

**The tests render conversations and compare them with llama.cpp's own rendering of the template** ([`../tests/qwen_data/template_cases.json`](../tests/qwen_data/template_cases.json)). Each case covers a branch. Tools come with a system message and without one. Calls bring arguments as text and as an object. Tool results come several in a row, and thinking blocks appear.

**Qwen3.5's template differs in these points**, and `template35.kspl` follows each:

* **A tool call is written as tags, not JSON**: `<function=name>`, then a `<parameter=key>` block per argument. A text argument is written as it stands. Any other is written as Python's `str` writes it, so `true` becomes `True`; an object or a list is written as `tojson` writes it.
* **The arguments are an object when the template reads them.** A client sends them as JSON text, and `llama-server` parses that text before it renders, so the server does too. Text that is no JSON is refused, as there.
* **Every message's text loses the white space at its ends**, as Python's `strip` takes it off. The system text follows the tools' instructions, where the request brings both.
* **An assistant message after the last question always gets a thinking block**, empty where the request brings no thinking.
* **The template refuses some conversations**: a system message after the first, or one with no question. The server refuses them too, with the template's own message.

Its cases are [`../tests/qwen_data/template35_cases.json`](../tests/qwen_data/template35_cases.json). They are rendered by llama.cpp's Jinja formatter from conversations given the shape `llama-server` gives them, with `enable_thinking` as `llama-server --jinja` sets it.

**Only these two templates are served.** Another model has its own template, and the hash refuses it. The server also refuses at start a vocabulary that lacks one of the templates' nine markers.

## Qwen3.5 thinks unless the request turns it off

**Qwen3.5's answer opens with its thinking, as `llama-server --jinja` asks of it.** The template opens a `<think>` block where `enable_thinking` is true. `llama-server` sets it true for a template that can think, unless it is started with `--reasoning off`. The user's `make model-server` starts it so. So ksagent meets the same model behind either server.

* **A request turns it off with `"chat_template_kwargs": {"enable_thinking": false}`**, as `llama-server` reads it. The template then writes an empty thinking block for the model to skip.
* **The thinking goes out as `message.reasoning_content`**, apart from `content`, as `llama-server` returns it. It is the text up to `</think>`, or up to the first tool call. A client that sends it back gets it written into the conversation; ksagent sends it back to no server.
* **Thinking takes tokens, and `--max-tokens` counts them.** A cap reached inside the thinking gives an answer with no content and `finish_reason: "length"`.
* **Qwen3-Instruct-2507 never thinks**, so a request that asks it to think is refused by name, rather than taken and ignored.

## Markers go in by their IDs

**The template writes a marker by its ID, and only where the template puts it.** The text between two markers is encoded as one piece, as Qwen's own tokenizer does.

* **A control marker's text is never its ID.** The tokenizer encodes `<|im_start|>` and `<|im_end|>` written as text into byte tokens, so only the template can open or end a turn.
* **So a control marker's text inside a message stays text.** A file can hold `<|im_end|>`. Encoded as the marker, it would end the turn the model reads, and the rest of the file would read as the model's own words.
* **A user-defined marker's text inside a message becomes its ID**, such as `<tool_call>` or `<think>`. That is how llama.cpp and Qwen's own tokenizer encode it, so the model reads the tokens it was trained on.
* **The IDs come from the file's vocabulary, by each marker's exact text** (`template.find_marks`). A marker is a token of type control or user-defined, whose text the vocabulary holds as it is.

## The cache is kept across requests

**A client sends the whole conversation on every round.** Reading a token through the model is slow on a CPU. Reading the whole conversation again would make every round slower than the last.

**So the server keeps the cache and compares token IDs.** `Engine.feed` in [`../examples/chat_server/engine.kspl`](../examples/chat_server/engine.kspl) finds the longest start that the new prompt shares with the tokens the cache holds. It computes only the tokens after that start.

* **At least the last token is computed again.** The cache holds its keys, but its scores are not kept.
* **The new tokens are read 64 at a time** (`PROMPT_PIECE`). A step decodes each weight block once for all its tokens, so a long prompt reads several times faster than token by token.
* **A kept row is the very row a fresh run computes.** Each position's keys depend only on the tokens before it, not on how they were cut into pieces. So the scores match a fresh run bit for bit, and the test compares them that way.
* **The answer reports what was kept**, as `usage.prompt_tokens_details.cached_tokens`.
* **A turn written back differently breaks the reuse at that point, not the answer.** The client can encode the model's earlier answer differently from the tokens the model generated. The comparison is by token, so the server computes again from the first difference.

**A Qwen3.5 model also keeps a running state, which cannot go back** ("Qwen3.5's linear layers keep a state" in [`DESIGN-learning.md`](DESIGN-learning.md)). A prompt that shares the whole of what the cache holds reads on from the state as it stands. Any other must find the state as it was at an earlier position.

* **So the server copies the state where the answer's turn opens**, at the prompt's last `<|im_start|>`. It keeps the four latest copies (`CHECKPOINTS` in [`../examples/chat_server/engine.kspl`](../examples/chat_server/engine.kspl)), and writes over the oldest.
* **A prompt that shares only part of the cache goes back to the latest copy at or before the parting**, and computes again from there. With no such copy, it computes from the start. A copy past the parting goes, since the cache rows it needs are written over next.
* **Why that place**: the next prompt shares the text before it, whatever comes after. With tools, the next round goes on after this answer. With a new question, the template writes this answer back without its thinking block, so the next prompt parts from the cache inside the turn. Either way, the turn's few opening tokens are all that is computed twice.
* **Why copies, not a run from the start**: a conversation of a few thousand tokens takes minutes to read on a CPU. A copy takes milliseconds.
* **A kept state gives a fresh run's scores, bit for bit**, as a kept row does. The tests compare a follow-up, the same prompt again, a longer one and one that parts at once with fresh runs ([`../tests/examples_chat35.kspl`](../tests/examples_chat35.kspl)).

## Generation and its stops

**Generation stops at `<|im_end|>` or `<|endoftext|>`, at the token limit, or where the context is full.** The token that ends the turn is not part of the answer. The limit is the request's `max_tokens`, capped by `--max-tokens`. A limit or a full context gives `finish_reason: "length"`.

**A prompt that leaves no room in the context is refused**, with a message that names both counts. Cutting the conversation would drop text the client believes the model read.

**The choice is greedy unless the request asks for sampling.** `temperature` or `top_p` turns on sampling through `sampler.sample`, and the other one takes the protocol's default, 1. `seed` makes a sampled answer repeat.

## Tool calls are read from the text

**Qwen3-Instruct-2507 writes a tool call as a `<tool_call>` block of JSON.** `reply.split_calls` in [`../examples/chat_server/reply.kspl`](../examples/chat_server/reply.kspl) turns each block into an entry of `message.tool_calls`. The text outside the blocks becomes `content`.

**Qwen3.5 writes `<function=name>` and a `<parameter=key>` block per argument inside the tags**, and the server reads them as `llama-server` does. An argument whose parameter takes text alone stays text. Any other is read as JSON where it reads, and stays text where it does not. The parameter's type is the `type` the request's tools give it.

* **The arguments go out as JSON text**, as the protocol sends them, whether the model wrote an object or a text.
* **A last block with no closing tag is read too.** Generation can stop inside it, or the model can end its turn without the tag.
* **A block whose JSON does not read as a call stays in the content, as written.** The client then sees what the model really wrote. A call made up from a broken block could run a tool the model did not ask for.
* **An answer with calls finishes with `"tool_calls"`**, and its content is `null` where no text stands outside the blocks.

## A field is applied, or refused

**A request field that would change the answer is applied or refused by name** (`request.read_chat` in [`../examples/chat_server/request.kspl`](../examples/chat_server/request.kspl)). A field accepted and ignored would let a client believe it took effect.

* **`"stream": true` is refused** with a message that says to send `false`. The server writes each answer whole, with its `Content-Length`.
* **Each field in `UNAPPLIED` is refused unless it holds the value that changes nothing**, such as `"n": 1` or `"tool_choice": "auto"`.
* **The request's `model` names nothing to choose.** The server holds one model, so any name picks it, and the answer names the model the server holds.

Caution: **A field in neither list goes unseen.** `std/json` does not list an object's members, so the reader can ask only for the names it knows.

**`GET /v1/models` is answered too**, with the one model's name. A client asks it to see that the server is up and which model it holds, and some clients ask it before their first chat. It reads nothing and changes nothing. Every other path gets 404, and another method gets 405.

## What it does not do

| Absent | Why |
| :-- | :-- |
| Streaming | `std/http` writes a body only with its length, and the client reads only a whole answer |
| Several requests at once | One cache and one core; see "One request at a time" above |
| Other models | Each has its own template, and the hash refuses one other than Qwen3-Instruct-2507's and Qwen3.5's |
| Speed near llama.cpp's | For Qwen3-4B, generating runs at about half llama.cpp's speed and reading a prompt at about a fifth. For Qwen3.5-9B they run at about two fifths and a sixth. The ksai section of [`docs/PLAN.md`](../../docs/PLAN.md) says what stands in the way |
| Listening beyond the loopback | No accounts and no encryption; see "It listens on the loopback only" above |

## Further reading

* [ksai](../README.md) — how to make the files the server reads, start it and point a client at it.
* [`DESIGN-learning.md`](DESIGN-learning.md) — the decisions of the engine the server runs on.
