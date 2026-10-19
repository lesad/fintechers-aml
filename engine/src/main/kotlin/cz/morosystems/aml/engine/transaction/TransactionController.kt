package cz.morosystems.aml.engine.transaction

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/transactions")
class TransactionController(private val transactions: TransactionRepository) {
    /**
     * Flagged transactions of the latest finished run, one page at a time.
     * `q` matches a transaction or client id; `rating` is `High`, `Medium` or `Low`.
     */
    @GetMapping
    fun list(
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) rating: String?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int,
    ): TransactionPage {
        if (page < 0 || size !in 1..MAX_SIZE) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "page >= 0, size 1..$MAX_SIZE")
        if (rating != null && rating !in RATINGS) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "rating is one of $RATINGS")
        return transactions.flagged(q, rating, page, size)
    }

    /** One transaction with its client, its alerts and their evidence, and the client's other transactions. */
    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): TransactionDetail =
        transactions.detail(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "transaction $id not found")

    private companion object {
        const val MAX_SIZE = 200
        val RATINGS = setOf("High", "Medium", "Low")
    }
}
