package cz.morosystems.aml.engine

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class AmountsTest {
    @Test
    fun plainWritesAnAmountWithoutExponentOrTrailingZero() {
        assertThat(plain(11_000_000.0)).isEqualTo("11000000")
        assertThat(plain(0.5)).isEqualTo("0.5")
        assertThat(plain(25.0)).isEqualTo(plain(25.0000))
    }

    @Test
    fun plainRefusesWhatIsNotAnAmount() {
        assertThatThrownBy { plain(Double.NaN) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun moneyGroupsDigitsAndRoundsToTheHeller() {
        // The drift a sum of doubles leaves behind must never reach a sentence a reviewer reads.
        assertThat(money(593_425.8300000001)).isEqualTo("CZK 593,425.83")
        assertThat(money(27_752.629999999997)).isEqualTo("CZK 27,752.63")
    }

    @Test
    fun moneyShowsTheHellerOnlyWhenThereIsOne() {
        assertThat(money(250_000.0)).isEqualTo("CZK 250,000")
        assertThat(money(0.5)).isEqualTo("CZK 0.50")
        assertThat(money(0.0)).isEqualTo("CZK 0")
    }
}
