package cz.morosystems.aml.engine.ai

import cz.morosystems.aml.engine.summary.Sentence
import cz.morosystems.aml.engine.transaction.TransactionRepository
import java.security.MessageDigest
import java.time.OffsetDateTime
import org.springframework.core.io.ClassPathResource

/**
 * The envelope of every model output on an alert (ADR-0043). `status` is `ready`, `rejected` (our checks refused the
 * reply; `error` says why) or `failed` (the model or the transport failed). `body` is set only when ready.
 */
data class AiResult(
    val alertId: Long,
    val kind: String,
    val status: String,
    val body: Any?,
    val error: String?,
    val modelId: String,
    val promptHash: String,
    val inputHash: String,
    val createdAt: OffsetDateTime,
)

const val READY = "ready"
const val REJECTED = "rejected"
const val FAILED = "failed"

/** A checked model reply. The claim walker reads every sentence through these two functions. */
interface AiBody {
    /** Every claim by where it sits, e.g. `sentences[0]`; each must cite known refs and quote only input numbers. */
    fun claims(): Map<String, Sentence>

    /** Other model text that cites nothing but may still quote only input numbers. */
    fun texts(): Map<String, String> = emptyMap()
}

class InvalidAiOutputException(message: String) : RuntimeException(message)

/**
 * What one kind of output supplies to [AiGenerator]: its prompt, its fixed JSON schema and how to read a reply.
 * `focusFiles` maps a triage disposition to a prompt paragraph appended to the base prompt.
 */
class AiKind<B : AiBody>(
    val name: String,
    promptFile: String,
    val schema: String,
    focusFiles: Map<String, String> = emptyMap(),
    val withFacts: Boolean = false,
    val parse: (Map<*, *>) -> B,
) {
    private val base: String = read(promptFile)
    private val focus: Map<String, String> = focusFiles.mapValues { read(it.value) }

    internal fun text(disposition: String?): String = focus[disposition]?.let { "$base\n\n$it" } ?: base

    private fun read(file: String) = ClassPathResource(file).getContentAsString(Charsets.UTF_8)
}

/** The system prompt for an alert with this triage disposition: the base prompt plus its focus, if the kind has one. */
fun AiKind<*>.system(disposition: String?): String = text(disposition)

fun AiKind<*>.promptHash(disposition: String?): String = sha256(system(disposition) + schema)

/** The hashes of every prompt this kind can send, so a stored result can be told current from stale. */
fun AiKind<*>.promptHashes(): Set<String> = (TransactionRepository.DISPOSITIONS + null).map { promptHash(it) }.toSet()

internal fun sha256(text: String) =
    MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
