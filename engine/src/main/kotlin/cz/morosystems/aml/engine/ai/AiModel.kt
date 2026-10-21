package cz.morosystems.aml.engine.ai

class AiModelException(message: String) : RuntimeException(message)

/**
 * One-shot question to a language model. The reply is untrusted text: callers validate it before storing or showing it.
 * Implementations: [LocalClaude] (the bean) and [cz.morosystems.aml.engine.bedrock.Bedrock].
 */
interface AiModel {
    /** The model the answers come from, stored with each result. */
    val modelId: String

    /** Plain-text answer. @throws AiModelException when the model gives no answer */
    fun ask(system: String, prompt: String, modelId: String = this.modelId): String

    /** JSON answer matching [schema]. @throws AiModelException when the model gives no answer */
    fun askJson(system: String, prompt: String, schemaName: String, schema: String): String
}
