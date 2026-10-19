package cz.morosystems.aml.engine.transaction

import cz.morosystems.aml.engine.user.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/transactions")
class TransactionController(private val transactions: TransactionRepository, private val users: UserRepository) {
    /**
     * Flagged transactions of the latest finished run, one page at a time.
     * `q` matches a transaction or client id; `rating` is `High`, `Medium` or `Low`; `status` (repeatable or
     * comma-separated) keeps transactions whose case status is one of those; `assignee` (a user id) keeps that
     * user's cases, and scopes `countsByRating` to them too.
     */
    @GetMapping
    fun list(
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) rating: String?,
        @RequestParam(required = false) status: List<String>?,
        @RequestParam(required = false) assignee: Long?,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "50") size: Int,
    ): TransactionPage {
        if (page < 0 || size !in 1..MAX_SIZE) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "page >= 0, size 1..$MAX_SIZE")
        if (rating != null && rating !in RATINGS) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "rating is one of $RATINGS")
        val statuses = status.orEmpty()
        if (!STATUSES.containsAll(statuses)) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "status is one of $STATUSES")
        return transactions.flagged(q, rating, statuses, assignee, page, size)
    }

    /** One transaction with its client, its alerts and their evidence, and the client's other transactions. */
    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): TransactionDetail =
        transactions.detail(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "transaction $id not found")

    /**
     * Up to `limit` of the client's transactions right before (`direction=older`) or after (`newer`)
     * transaction `id`, newest first; `more` says whether further ones exist. Page on with the last id shown.
     */
    @GetMapping("/{id}/history")
    fun history(
        @PathVariable id: String,
        @RequestParam direction: String,
        @RequestParam(defaultValue = "5") limit: Int,
    ): HistoryPage {
        if (direction !in DIRECTIONS) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "direction is one of $DIRECTIONS")
        if (limit !in 1..MAX_SIZE) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "limit 1..$MAX_SIZE")
        return transactions.history(id, older = direction == "older", limit)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "transaction $id not found")
    }

    /**
     * Sets the status of the transaction's alerts in the latest run, e.g. `{"status": "ESCALATED", "reason": "…"}`,
     * on behalf of the user in `X-User-Id`, and logs it. Escalating hands the case to the manager.
     */
    @PutMapping("/{id}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun status(
        @PathVariable id: String,
        @RequestHeader("X-User-Id", required = false) userId: Long?,
        @RequestBody body: StatusChange,
    ) {
        val actor = knownUser(userId)
        if (body.status !in STATUSES) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "status is one of $STATUSES")
        val reason = body.reason?.trim().orEmpty()
        if (reason.isEmpty()) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "a decision needs a reason")
        if (!transactions.setStatus(id, body.status, actor, reason)) throw noAlert(id)
    }

    /**
     * Hands the case to another user, e.g. `{"userId": 2}`, on behalf of the user in `X-User-Id`, and logs it.
     * A closed case (false positive or reported) stays with whoever closed it: 409.
     */
    @PutMapping("/{id}/assignee")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun assignee(
        @PathVariable id: String,
        @RequestHeader("X-User-Id", required = false) userId: Long?,
        @RequestBody body: AssigneeChange,
    ) {
        val actor = knownUser(userId)
        if (!users.exists(body.userId)) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "userId names no known user")
        val status = transactions.caseStatus(id) ?: throw noAlert(id)
        if (status in CLOSED) throw ResponseStatusException(HttpStatus.CONFLICT, "a closed case ($status) cannot be reassigned")
        if (!transactions.assign(id, body.userId, actor)) throw noAlert(id)
    }

    private fun knownUser(userId: Long?): Long =
        userId?.takeIf(users::exists) ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "X-User-Id names no known user")

    private fun noAlert(id: String) = ResponseStatusException(HttpStatus.NOT_FOUND, "transaction $id has no alert in the latest run")

    private companion object {
        const val MAX_SIZE = 200
        val RATINGS = setOf("High", "Medium", "Low")
        val STATUSES = setOf("NEW", "ESCALATED", "FALSE_POSITIVE", "REPORTED")
        val DIRECTIONS = setOf("older", "newer")
        val CLOSED = setOf("FALSE_POSITIVE", "REPORTED")
    }
}

data class StatusChange(val status: String, val reason: String?)

data class AssigneeChange(val userId: Long)
