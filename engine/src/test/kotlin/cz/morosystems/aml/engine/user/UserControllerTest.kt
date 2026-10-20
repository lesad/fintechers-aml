package cz.morosystems.aml.engine.user

import cz.morosystems.aml.engine.PostgresTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.assertj.MockMvcTester

@PostgresTest
@AutoConfigureMockMvc
class UserControllerTest {
    @Autowired
    lateinit var mvc: MockMvcTester

    @Test
    fun listsTheSeededReviewerAndManager() {
        val body = assertThat(mvc.get().uri("/api/users")).hasStatusOk().bodyJson()
        body.extractingPath("$[*].role").asArray().containsExactly("ANALYST", "COMPLIANCE_OFFICER", "COMPLIANCE_MANAGER")
        body.extractingPath("$[0].name").isEqualTo("J. Novák")
    }
}
