package cz.morosystems.aml.engine.triage

import java.math.BigDecimal
import java.time.LocalDate
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

/**
 * The decision is a pure function of its input, and the input hash is a function of the input's *meaning*, not of
 * the order a run happened to emit it in.
 */
class TriageDeterminismTest {
    private val config = TriageTest.CONFIG

    @Test
    fun theSameInputDecidedTwiceGivesTheSameDecision() {
        val input = baseline()
        assertThat(Triage.decide(input, config)).isEqualTo(Triage.decide(input, config))
    }

    @Test
    fun twoEqualInputsBuiltSeparatelyHashAlike() {
        assertThat(Triage.decide(baseline(), config).inputHash).isEqualTo(Triage.decide(baseline(), config).inputHash)
    }

    @Test
    fun theOrderTheHitsArrivedInDoesNotChangeTheHash() {
        val hits = listOf(hit("W1", "G1"), hit("N1", "G2"), hit("M1", "G3"))
        val expected = hashOf(baseline().copy(hits = hits))
        listOf(hits.reversed(), listOf(hits[1], hits[2], hits[0]), listOf(hits[2], hits[0], hits[1])).forEach {
            assertThat(hashOf(baseline().copy(hits = it))).isEqualTo(expected)
        }
    }

    @Test
    fun theOrderOfTheCountryAndAlertTypeSetsDoesNotChangeTheHash() {
        val one = baseline().copy(
            counterpartyCountries = linkedSetOf("IR", "CZ", "KP"),
            otherAlertTypesOnClient = linkedSetOf("C", "B"),
        )
        val other = baseline().copy(
            counterpartyCountries = linkedSetOf("KP", "CZ", "IR"),
            otherAlertTypesOnClient = linkedSetOf("B", "C"),
        )
        assertThat(hashOf(other)).isEqualTo(hashOf(one))
    }

    @Test
    fun changingAnyMeaningfulFieldChangesTheHash() {
        val base = baseline()
        val mutations = mapOf(
            "alertId" to base.copy(alertId = 2),
            "alertType" to base.copy(alertType = "B"),
            "clientId" to base.copy(clientId = "K2"),
            "transactionId" to base.copy(transactionId = "T2"),
            "asOf" to base.copy(asOf = base.asOf.plusDays(1)),
            "hits" to base.copy(hits = base.hits + hit("N1", "G9")),
            "hit rule version" to base.copy(hits = listOf(hit("W1", "G1").copy(ruleVersion = 2))),
            "hit evidence" to base.copy(hits = listOf(hit("W1", "G1").copy(evidence = mapOf("amount" to 2L)))),
            "client risk" to base.copy(client = base.client.copy(risk = "high")),
            "client pep" to base.copy(client = base.client.copy(pep = true)),
            "client country" to base.copy(client = base.client.copy(country = "IR")),
            "client channel" to base.copy(client = base.client.copy(channel = "distant form")),
            "client contract date" to base.copy(client = base.client.copy(contractDate = LocalDate.of(2021, 1, 1))),
            "client expected monthly volume" to base.copy(client = base.client.copy(expectedMonthlyVolume = 20_000_000L)),
            "client q2 volume" to base.copy(client = base.client.copy(q2Volume = 40_000_000L)),
            "client q2 tx count" to base.copy(client = base.client.copy(q2TxCount = 31)),
            "client q2 days" to base.copy(client = base.client.copy(q2Days = 61)),
            "counterparty countries" to base.copy(counterpartyCountries = setOf("IR")),
            "amount" to base.copy(amountMinor = 2_000_000),
            "other alert types" to base.copy(otherAlertTypesOnClient = setOf("C")),
        )
        val hashes = mutations.mapValues { hashOf(it.value) }
        hashes.forEach { (field, hash) -> assertThat(hash).describedAs("changing $field").isNotEqualTo(hashOf(base)) }
        assertThat(hashes.values.toSet()).describedAs("no two mutations collide").hasSize(mutations.size)
    }

    @Test
    fun aNullFieldHashesDifferentlyFromAValue() {
        assertThat(hashOf(baseline().copy(amountMinor = null))).isNotEqualTo(hashOf(baseline()))
        assertThat(hashOf(baseline().copy(transactionId = null))).isNotEqualTo(hashOf(baseline()))
    }

    @Test
    fun theHashIsLowercaseHexOfAFullSha256() {
        assertThat(hashOf(baseline())).hasSize(64).matches("[0-9a-f]{64}")
    }

    @Test
    fun canonicalJsonSortsObjectKeys() {
        assertThat(CanonicalJson.render(mapOf("b" to 1, "a" to 2, "C" to 3))).isEqualTo("""{"C":3,"a":2,"b":1}""")
    }

    @Test
    fun canonicalJsonSortsSetElementsButKeepsListOrder() {
        assertThat(CanonicalJson.render(linkedSetOf("c", "a", "b"))).isEqualTo("""["a","b","c"]""")
        assertThat(CanonicalJson.render(listOf("c", "a", "b"))).isEqualTo("""["c","a","b"]""")
    }

    @Test
    fun canonicalJsonRendersTheValueTypesTheInputIsBuiltFrom() {
        assertThat(CanonicalJson.render(null)).isEqualTo("null")
        assertThat(CanonicalJson.render(true)).isEqualTo("true")
        assertThat(CanonicalJson.render(42L)).isEqualTo("42")
        assertThat(CanonicalJson.render(LocalDate.of(2026, 6, 30))).isEqualTo("\"2026-06-30\"")
        assertThat(CanonicalJson.render(Disposition.ESCALATE)).isEqualTo("\"ESCALATE\"")
        assertThat(CanonicalJson.render(BigDecimal("1200.00"))).isEqualTo("1200")
        assertThat(CanonicalJson.render("a\"b\n")).isEqualTo("\"a\\\"b\\n\"")
    }

    @Test
    fun canonicalJsonRefusesFloatingPointBecauseMoneyIsNeverAFloat() {
        assertThatThrownBy { CanonicalJson.render(1.5) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("floating point")
        assertThatThrownBy { CanonicalJson.render(1.5f) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("floating point")
        assertThatThrownBy { CanonicalJson.render(mapOf("amount" to 1.5)) }
            .isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun canonicalJsonRefusesANonStringMapKey() {
        assertThatThrownBy { CanonicalJson.render(mapOf(1 to "a")) }.isInstanceOf(IllegalStateException::class.java)
    }

    private fun hashOf(input: TriageInput) = CanonicalJson.sha256(input.canonicalForm())

    private fun hit(rule: String, grainKey: String) = TriagedHit(rule, 1, grainKey, mapOf("amount" to 1_000_000L))

    private fun baseline() = TriageInput(
        alertId = 1,
        alertType = "A",
        clientId = "K1",
        transactionId = "T1",
        asOf = LocalDate.of(2026, 6, 30),
        hits = listOf(hit("W1", "G1")),
        client = ClientFacts(
            id = "K1",
            risk = "low",
            pep = false,
            country = "CZ",
            channel = "in person",
            contractDate = LocalDate.of(2020, 1, 1),
            expectedMonthlyVolume = 10_000_000L,
            q2Volume = 30_000_000L,
            q2TxCount = 30,
            q2Days = 60,
        ),
        counterpartyCountries = emptySet(),
        amountMinor = 1_000_000,
        otherAlertTypesOnClient = emptySet(),
    )
}
