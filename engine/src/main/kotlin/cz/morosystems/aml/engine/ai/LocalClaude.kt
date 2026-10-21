package cz.morosystems.aml.engine.ai

import java.io.File
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/** [modelId] goes to `claude --model`, so it is a CLI alias such as `sonnet`, not a Bedrock ID. */
@ConfigurationProperties("local-claude")
data class LocalClaudeProperties(val modelId: String)

/**
 * Asks the local Claude Code CLI (`claude -p`) under the account it is signed in with; replaced Bedrock once AWS access ended.
 *
 * @throws AiModelException when the CLI fails or its reply holds no answer
 */
@Component
class LocalClaude(private val properties: LocalClaudeProperties) : AiModel {
    private val json = JsonMapper()

    override val modelId: String get() = properties.modelId

    override fun ask(system: String, prompt: String, modelId: String): String =
        claude(system, prompt, modelId).path("result").asString()

    override fun askJson(system: String, prompt: String, schemaName: String, schema: String): String {
        val answer = claude(system, prompt, modelId, schema).get("structured_output")
            ?: throw AiModelException("claude CLI reply has no structured output")
        return json.writeValueAsString(answer)
    }

    private fun claude(system: String, prompt: String, model: String, schema: String? = null): JsonNode {
        // No tools and no settings, so the CLI only answers; run outside the repo so no CLAUDE.md is picked up.
        val command = mutableListOf(
            "claude", "-p", "--model", model, "--system-prompt", system,
            "--tools", "", "--setting-sources", "", "--output-format", "json",
        )
        if (schema != null) command += listOf("--json-schema", schema)
        val process = ProcessBuilder(command)
            .directory(File(System.getProperty("java.io.tmpdir")))
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start()
        process.outputStream.bufferedWriter().use { it.write(prompt) }
        val out = process.inputStream.bufferedReader().readText()
        if (process.waitFor() != 0) throw AiModelException("claude CLI exited with ${process.exitValue()}: ${out.take(500)}")
        val reply = json.readTree(out)
        if (reply.path("is_error").asBoolean()) throw AiModelException("claude CLI error: ${reply.path("result").asString()}")
        return reply
    }
}
