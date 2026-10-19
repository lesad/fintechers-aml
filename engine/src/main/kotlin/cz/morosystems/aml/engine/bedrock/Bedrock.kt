package cz.morosystems.aml.engine.bedrock

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient
import software.amazon.awssdk.services.bedrockruntime.model.ContentBlock
import software.amazon.awssdk.services.bedrockruntime.model.ConversationRole
import software.amazon.awssdk.services.bedrockruntime.model.ConverseResponse
import software.amazon.awssdk.services.bedrockruntime.model.JsonSchemaDefinition
import software.amazon.awssdk.services.bedrockruntime.model.Message
import software.amazon.awssdk.services.bedrockruntime.model.OutputFormatStructure
import software.amazon.awssdk.services.bedrockruntime.model.OutputFormatType
import software.amazon.awssdk.services.bedrockruntime.model.StopReason
import software.amazon.awssdk.services.bedrockruntime.model.SystemContentBlock

@ConfigurationProperties("bedrock")
data class BedrockProperties(
    val region: String = "eu-central-1",
    val modelId: String,
)

class BedrockException(message: String) : RuntimeException(message)

/**
 * One-shot text question to a Bedrock model through the Converse API.
 *
 * Credentials come from the default AWS chain, so locally `AWS_PROFILE=hackathon` after `aws sso login`.
 * The reply is untrusted text: callers validate it before storing or showing it.
 *
 * @throws BedrockException when the reply holds no text block
 */
@Component
class Bedrock(private val properties: BedrockProperties) {
    val modelId: String get() = properties.modelId

    private val client: BedrockRuntimeClient by lazy {
        BedrockRuntimeClient.builder().region(Region.of(properties.region)).build()
    }

    fun ask(system: String, prompt: String, modelId: String = properties.modelId): String = answerText(
        client.converse { request ->
            request.modelId(modelId)
                .system(SystemContentBlock.fromText(system))
                .messages(Message.builder().role(ConversationRole.USER).content(ContentBlock.fromText(prompt)).build())
        },
    )

    /**
     * Like [ask], but the model must answer with JSON matching [schema] (Bedrock structured outputs).
     * Keep the schema fixed: Bedrock compiles each new schema once, which can take minutes.
     */
    fun askJson(system: String, prompt: String, schemaName: String, schema: String): String {
        val response = client.converse { request ->
            request.modelId(properties.modelId)
                .system(SystemContentBlock.fromText(system))
                .messages(Message.builder().role(ConversationRole.USER).content(ContentBlock.fromText(prompt)).build())
                .outputConfig { config ->
                    config.textFormat { format ->
                        format.type(OutputFormatType.JSON_SCHEMA)
                            .structure(OutputFormatStructure.fromJsonSchema(JsonSchemaDefinition.builder().name(schemaName).schema(schema).build()))
                    }
                }
        }
        if (response.stopReason() != StopReason.END_TURN) throw BedrockException("Bedrock stopped with ${response.stopReasonAsString()}")
        return answerText(response)
    }
}

internal fun answerText(response: ConverseResponse): String =
    response.output().message().content().firstNotNullOfOrNull { it.text() }
        ?: throw BedrockException("Bedrock reply has no text block")
