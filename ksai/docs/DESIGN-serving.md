# How ksai serves a chat model

This document gives the reasons behind `chat_server`, the example that serves a Qwen3-Instruct-2507 or Qwen3.5 model over HTTP, from its GGUF file. It is for whoever changes the server. How to start it is in "The chat server" in [ksai](../README.md). The code is in [`../examples/chat_server/`](../examples/chat_server/main.kspl).

Words used here: a *marker* is a token the template writes by its ID, such as `<|im_start|>`. The *cache* is the model's keys and values for each position it has read. A *client* is the program that sends the requests, such as ksagent.

## What it is for

**The server lets a client with tools run with no model server from outside.** It answers `POST /v1/chat/completions` in the OpenAI style, with `tools`, whole or as a stream. Many local model servers share that protocol, so a client written for them needs no change.

**It is an example of the package, not a library.** It joins ksai's own parts: the GGUF reader, the Qwen model (`Qwen` in [`../qwen.kspl`](../qwen.kspl)), the tokenizer and the sampler. It imports that model rather than holding a copy.

## Everything comes from one GGUF file

**`chat_server <model.gguf>` reads the weights, the vocabulary and the chat template from the one file** that llama.cpp runs too. So the server and llama.cpp cannot be handed parts of two models.

* **The weights are used where they lie** in the file's bytes ("A GGUF file is read once and used in place" in [`DESIGN-learning.md`](DESIGN-learning.md)).
* **The vocabulary** is the file's `tokenizer.ggml.tokens`, `.merges` and `.token_type`, made into a tokenizer by `Tokenizer.load_lists`. Only GPT-2's byte-level kind is read, with the splitting rule the file names: `qwen2` or `qwen35`. Another is refused at start.
* **The chat template** is the file's `tokenizer.chat_template`. The server renders its own copy of it, tied to the file's text by a hash ("The chat template is kept in one place" below).

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

A server for other machines needs all three, which is a separate decision with its own rules for who may ask.

**A web page on this machine can reach the loopback too**, from the person's browser. So the server refuses what only a page sends, before it reads the body:

| What a page can do | What the server refuses |
| :-- | :-- |
| A form or a script sends a POST of plain text, which needs no consent from the server | A body whose `Content-Type` is not `application/json`, or that has none (415). A page can send JSON to another site only after a preflight, which the server never answers |
| A script on another site sends any request, and the browser names that site in `Origin` | An `Origin` other than `http://` or `https://` on 127.0.0.1, localhost or [::1], at any port. `null` is refused too (403) |
| A page whose name was pointed at 127.0.0.1 reads the answers as its own | A `Host` other than 127.0.0.1 or localhost with the server's port (403) |

**A program passes all three**: it sends no `Origin`, the address it connected to as its `Host`, and its body as JSON. ksagent and the OpenAI Python SDK send these. A page served from this machine is let through, since the program that serves it could ask the server itself.

## One request at a time

**The server reads, answers and closes one connection before it accepts the next.** Other connections wait in the operating system's queue.

* **The model has one cache.** Two requests at once would need a cache each, which doubles the memory, and each would overwrite the start the other could reuse.
* **One request already keeps every core busy.** A second one makes both slower, and neither finishes sooner.
* **A request has a time limit for arriving and for leaving.** It must arrive whole within 30 seconds, and each write of its answer must leave within 30 seconds. So a client that stops halfway cannot hold the server.

**The price is a wait**: a second client waits until the first answer is written. The generation itself has no time limit, since a slow CPU is no fault of the client.

## The chat template is kept in one place

**The template is the text the model was trained to read around each message.** A template that differs by one line break gives worse answers, with no error anywhere.

**[`../examples/chat_server/template.kspl`](../examples/chat_server/template.kspl) follows the chat template of Qwen3-4B-Instruct-2507's GGUF file, and [`../examples/chat_server/template35.kspl`](../examples/chat_server/template35.kspl) that of Qwen3.5-9B's.** Each writes the branches in its template's order, with the fixed text as constants at the top. So each compares with its template line by line, and a fix is made in that file alone. Both use `template.kspl`'s conversation, markers and builder of the token IDs.

**The server does not run the file's template; it checks it.** Running it would need a Jinja interpreter in KSPL, a language of its own with loops, filters and Python's string methods. Instead each `matches` compares the SHA-256 of the file's text with the one its `render` follows. The server refuses at start a file whose template is neither. So a template changed by one character is refused, rather than rendered by stale code.

**The tests compare rendered conversations with llama.cpp's own rendering of each template**, a case per branch ([`../tests/qwen_data/template_cases.json`](../tests/qwen_data/template_cases.json), [`../tests/qwen_data/template35_cases.json`](../tests/qwen_data/template35_cases.json)). Qwen3.5's cases have the shape `llama-server` gives a conversation, with `enable_thinking` as `llama-server --jinja` sets it.

**The server renders what `llama-server` hands the template**, where the two could differ:

* **Qwen3.5's template reads tool-call arguments as an object.** A client sends them as JSON text, which `llama-server` parses before it renders, so the server does too. Text that is no JSON is refused, as there.
* **Qwen3.5's template refuses some conversations**: a system message after the first, or one with no question. The server refuses them too, with the template's own message.

**Only these two templates are served**; the hash refuses another model's. The server also refuses at start a vocabulary that lacks one of the templates' nine markers.

## Qwen3.5 thinks unless the request turns it off

**Qwen3.5's answer opens with its thinking, as `llama-server --jinja` asks of it.** The template opens a `<think>` block where `enable_thinking` is true. `llama-server` sets it true for a template that can think, unless started with `--reasoning off`; `make chat` starts it without that option. So ksagent meets the same model behind either server.

* **A request turns it off with `"chat_template_kwargs": {"enable_thinking": false}`**, as `llama-server` reads it. The template then writes an empty thinking block for the model to skip.
* **The thinking goes out as `message.reasoning_content`**, apart from `content`, as `llama-server` returns it. It is the text up to `</think>`, or up to the first tool call. A client that sends it back gets it written into the conversation; ksagent sends it back to no server.
* **Thinking takes tokens, and `--max-tokens` counts them.** A cap reached inside the thinking gives an answer with no content and `finish_reason: "length"`.
* **Qwen3-Instruct-2507 never thinks**, so a request that asks it to think is refused by name, rather than taken and ignored.

## Markers go in by their IDs

**The template writes a marker by its ID, and only where the template puts it.** The text between two markers is encoded as one piece, as Qwen's own tokenizer does.

* **A control marker's text inside a message stays text.** The tokenizer encodes `<|im_start|>` and `<|im_end|>` written as text into byte tokens, so only the template can open or end a turn. A file can hold `<|im_end|>`; encoded as the marker, the rest of the file would read as the model's own words.
* **A user-defined marker's text inside a message becomes its ID**, such as `<tool_call>` or `<think>`, as llama.cpp encodes it ("The tokenizer gives llama.cpp's tokens" in [`DESIGN-learning.md`](DESIGN-learning.md)).
* **The IDs come from the file's vocabulary, by each marker's exact text** (`template.find_marks`).

## The cache is kept across requests

**A client sends the whole conversation on every round**, and reading a token through the model is slow on a CPU. Reading the whole conversation again would make every round slower than the last.

**So the server keeps the cache and compares token IDs.** `Engine.feed` in [`../examples/chat_server/engine.kspl`](../examples/chat_server/engine.kspl) finds the longest start that the new prompt shares with the tokens the cache holds. It computes only the tokens after that start.

* **At least the last token is computed again.** The cache holds its keys, but its scores are not kept.
* **The new tokens are read 64 at a time** (`PROMPT_PIECE`), so a long prompt reads several times faster than token by token.
* **A kept row is the very row a fresh run computes**, since each position's keys depend only on the tokens before it. So the scores match a fresh run bit for bit, and the test compares them that way.
* **The answer reports what was kept**, as `usage.prompt_tokens_details.cached_tokens`.
* **A turn written back differently breaks the reuse at that point, not the answer.** The client can encode the model's earlier answer differently from the tokens the model generated. The server then computes again from the first differing token.

**A Qwen3.5 model also keeps a running state, which cannot go back** ("Qwen3.5's linear layers keep a state" in [`DESIGN-learning.md`](DESIGN-learning.md)). A prompt that shares all the cache holds reads on from the state as it stands. Any other needs the state as it was at an earlier position.

* **So the server copies the state where the answer's turn opens**, at the prompt's last `<|im_start|>`. It keeps the four latest copies (`CHECKPOINTS` in [`../examples/chat_server/engine.kspl`](../examples/chat_server/engine.kspl)), and writes over the oldest.
* **A prompt that shares only part of the cache goes back to the latest copy at or before the parting.** With no such copy, it starts afresh. A copy past the parting goes, since the cache rows it needs are written over next.
* **Why that place**: the next prompt shares the text before it. With tools, the next round goes on after this answer. With a new question, the template writes this answer back without its thinking, so the next prompt parts inside the turn. Either way, only the turn's few opening tokens are computed twice.
* **Why copies, not a run from the start**: a conversation of a few thousand tokens takes minutes to read on a CPU. A copy takes milliseconds.
* **A kept state gives a fresh run's scores, bit for bit.** The tests compare a follow-up, the same prompt again, a longer one and one that parts at once with fresh runs ([`../tests/examples_chat35.kspl`](../tests/examples_chat35.kspl)).

## Generation and its stops

**Generation stops at `<|im_end|>` or `<|endoftext|>`, at the token limit, or where the context is full.** The token that ends the turn is not part of the answer. The limit is the request's `max_tokens`, capped by `--max-tokens`. A limit or a full context gives `finish_reason: "length"`, even where the answer holds a call, as `llama-server` gives it. The last call can be cut there, and `"tool_calls"` would tell the client that every call is whole.

**A prompt that leaves no room in the context is refused**, with a message that names both counts. Cutting the conversation would drop text the client believes the model read.

**The choice is greedy unless the request asks for sampling.** `temperature` or `top_p` turns on sampling through `sampler.sample`, and the other one takes the protocol's default, 1. `seed` makes a sampled answer repeat.

## Tool calls are read from the text

**Qwen3-Instruct-2507 writes a tool call as a `<tool_call>` block of JSON.** Qwen3.5 writes `<function=name>` and a `<parameter=key>` block per argument inside the tags. `reply.read_text` in [`../examples/chat_server/reply.kspl`](../examples/chat_server/reply.kspl) turns each block into an entry of `message.tool_calls`, and the text outside the blocks becomes `content`.

**A block is a call once its start reads as one**, and its arguments then grow with the text:

| Model | The start of a call | The arguments |
| :-- | :-- | :-- |
| Qwen3-Instruct-2507 | `{"name": "<name>", "arguments": {` | The JSON object as the model wrote it, to its closing brace |
| Qwen3.5 | `<function=<name>>` | A JSON object the server writes, a member per `<parameter=key>` |

* **Why at its start, not at its end**: ksagent's answer is a tool call, `answer`, whose text is what the person waits for. Read at its end, it would show nothing until its block closes.
* **A call cut short keeps its arguments as far as they came**, which is then no whole JSON. A stream has sent those pieces already, and the answer sent whole gives the same. The answer finishes with `"length"`, so the client can tell. A client must check the arguments before it runs a tool anyway, since a model can write arguments that are no JSON. The call's name is whole, so no tool runs that the model did not name.
* **Qwen3-Instruct-2507's arguments go out as the model wrote them**, spaces included. Written back on the next round, they are the very tokens the model wrote, so the cache is kept to there.
* **A Qwen3.5 parameter is read by the `type` the request's tools give it**, as `llama-server` reads it. Text grows as it arrives; any other type is read as JSON once its closing tag comes.
* **A Qwen3.5 block closed by `</tool_call>` always gives a whole JSON object**, since the server writes it. A value with no `</parameter>` runs to that tag, and text between parameters belongs to no argument.
* **A block whose start reads as no call stays in the content, as written.** A Qwen3-Instruct-2507 block with its members in another order is read once it closes.

How `reply.kspl` handles the remaining cases, such as a parameter given twice, is in its comments.

## An answer streams as it is written

**`"stream": true` sends the answer in pieces as the model writes it**, as server-sent events in a chunked body. The shape is `llama-server`'s, which OpenAI-style clients read:

1. The head, `Content-Type: text/event-stream`, and a first piece holding `"role": "assistant"`.
2. One piece per generated token that adds something: `reasoning_content`, `content`, or a call's piece.
3. A call's first piece holds its `index`, `id`, `type` and `name`, with its `arguments` so far. Each later piece holds only more arguments.
4. A piece with an empty delta and the `finish_reason`.
5. Where `stream_options.include_usage` asks, a piece with no choice and the `usage`.
6. `data: [DONE]`, then the last chunk.

**One reading serves the whole answer and the stream** (`reply.read_text`). It reads the text so far, except what later text could still change. That is a tail that can still become a tag, white space at the ends, or part of a character. So each reading extends the last, and a piece is what one reading adds. **The pieces put together are the answer sent whole, bit for bit**, which the tests check with every text read a byte at a time.

* **The head goes out before the prompt is read**, once every check of the request has passed. Reading a long prompt takes minutes on a CPU, and some clients give up on a head that has not come. A comment line (`:`) then goes out where nothing was written for 10 seconds.
* **A client that leaves stops the work** at the next piece of the prompt or the next token. The cache keeps what was read, for the next request.

## A field is applied, or refused

**A request field that would change the answer is applied or refused by name** (`request.read_chat` in [`../examples/chat_server/request.kspl`](../examples/chat_server/request.kspl)). A field accepted and ignored would let a client believe it took effect.

* **`"stream"` is applied: `true` streams the answer** ("An answer streams as it is written" above). `stream_options` is refused without a stream, where it would change nothing, and its `include_usage` is applied.
* **Each field in `UNAPPLIED` is refused unless it holds the value that changes nothing**, such as `"n": 1` or `"tool_choice": "auto"`.
* **The request's `model` names nothing to choose.** The server holds one model, so any name picks it, and the answer names the model the server holds.

Caution: **A field in neither list goes unseen.** `std/json` does not list an object's members, so the reader can ask only for the names it knows.

**`GET /v1/models` is answered too**, with the one model's name. Clients ask it to see that the server is up and which model it holds, some before their first chat. Every other path gets 404, and another method gets 405.

## What it does not do

Besides several requests at once, other models and other addresses (the sections above), **it does not reach llama.cpp's speed**. The measurements are in [`ksai/benches/README.md`](../benches/README.md). What stands in the way is "The kernels are spelt for the auto-vectorizer, not with intrinsics" in [`DESIGN-learning.md`](DESIGN-learning.md). The plan to pass it is the ksai section of [`docs/PLAN.md`](../../docs/PLAN.md).

## Further reading

* [ksai](../README.md) — how to make the files the server reads, start it and point a client at it.
* [`DESIGN-learning.md`](DESIGN-learning.md) — the decisions of the engine the server runs on.
