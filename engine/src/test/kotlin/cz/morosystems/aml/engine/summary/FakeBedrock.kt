package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.bedrock.Bedrock
import cz.morosystems.aml.engine.bedrock.BedrockProperties
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary

/** Stands in for Bedrock: returns [reply], or throws [failure] when set, and remembers the system and user prompts it was given. */
class FakeBedrock : Bedrock(BedrockProperties(modelId = "fake-model")) {
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
}

@TestConfiguration(proxyBeanMethods = false)
class FakeBedrockConfig {
    @Bean
    @Primary
    fun fakeBedrock() = FakeBedrock()
}
