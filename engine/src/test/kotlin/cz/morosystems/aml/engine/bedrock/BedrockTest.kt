package cz.morosystems.aml.engine.bedrock

import cz.morosystems.aml.engine.ai.AiModelException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import software.amazon.awssdk.services.bedrockruntime.model.ContentBlock
import software.amazon.awssdk.services.bedrockruntime.model.ConverseOutput
import software.amazon.awssdk.services.bedrockruntime.model.ConverseResponse
import software.amazon.awssdk.services.bedrockruntime.model.Message
import software.amazon.awssdk.services.bedrockruntime.model.ReasoningContentBlock
import software.amazon.awssdk.services.bedrockruntime.model.ReasoningTextBlock

class BedrockTest {
    private fun reply(vararg blocks: ContentBlock) = ConverseResponse.builder()
        .output(ConverseOutput.fromMessage(Message.builder().content(*blocks).build()))
        .build()

    private val reasoning = ContentBlock.fromReasoningContent(
        ReasoningContentBlock.fromReasoningText(ReasoningTextBlock.builder().text("thinking").build()),
    )

    @Test
    fun skipsReasoningBeforeTheAnswer() {
        assertThat(answerText(reply(reasoning, ContentBlock.fromText("answer")))).isEqualTo("answer")
    }

    @Test
    fun failsWithoutATextBlock() {
        assertThatThrownBy { answerText(reply(reasoning)) }.isInstanceOf(AiModelException::class.java)
    }
}
