package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.ai.AiModel
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary

/** Stands in for the model's JSON call: returns [reply], or throws [failure] when set, and remembers the system and user prompts it was given. */
class FakeAiModel : AiModel {
    override val modelId = "fake-model"
    var reply = ""
    var prompt = ""
    var system = ""
    var failure: RuntimeException? = null

    override fun askJson(system: String, prompt: String, schemaName: String, schema: String): String {
        this.system = system
        this.prompt = prompt
        failure?.let { throw it }
        return reply
    }

    override fun ask(system: String, prompt: String, modelId: String) = throw UnsupportedOperationException()
}

@TestConfiguration(proxyBeanMethods = false)
class FakeAiModelConfig {
    @Bean
    @Primary
    fun fakeAiModel() = FakeAiModel()
}
