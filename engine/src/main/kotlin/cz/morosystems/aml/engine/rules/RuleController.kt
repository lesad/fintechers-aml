package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompileException
import cz.morosystems.aml.engine.user.AppUser
import cz.morosystems.aml.engine.user.UserRepository
import java.time.LocalDate
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

class ExplanationUnavailableException : RuntimeException("the model gave no usable explanation; try again")

@RestController
@RequestMapping("/api/rules")
class RuleController(private val rules: RuleService, private val users: UserRepository, private val backtests: BacktestService) {
    /** Every rule version, by key, newest version first. */
    @GetMapping
    fun all(): List<RuleVersionJson> = rules.all().map { it.toJson() }

    /** What a condition, anchor or filter may name, for the editor's autocomplete. */
    @GetMapping("/vocabulary")
    fun vocabulary(): VocabularyJson = rules.vocabulary()

    @GetMapping("/{id}")
    fun find(@PathVariable id: Long): RuleVersionJson =
        rules.find(id)?.toJson() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "rule version $id not found")

    /** Saves a new draft version; 201 even when the explanation could not be written (`explanation: null`). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun save(@RequestBody body: RuleBody): RuleVersionJson = rules.save(body.toNewRule()).toJson()

    /** Overwrites a draft and writes its explanation again; 400 when the version is not a draft, 404 when there is none. */
    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody body: RuleBody): RuleVersionJson =
        rules.update(id, body.toNewRule())?.toJson() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "rule version $id not found")

    /** Sends a draft for approval to a manager; 400 when the version is not a draft. */
    /** Deletes a draft; 400 for any other status, 404 when there is no such version. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) {
        if (!rules.delete(id)) throw notFound(id)
    }

    @PostMapping("/{id}/submit")
    fun submit(@PathVariable id: Long): RuleVersionJson = (rules.submit(id) ?: throw notFound(id)).toJson()

    /** Activates a pending version for the manager in `X-User-Id`; 403 for anyone else, 400 when it is not pending. */
    @PostMapping("/{id}/approve")
    fun approve(@PathVariable id: Long, @RequestHeader("X-User-Id", required = false) userId: Long?): RuleVersionJson =
        (rules.approve(id, knownUser(userId)) ?: throw notFound(id)).toJson()

    /** Sends a pending version back to draft for the manager in `X-User-Id`; 403 for anyone else, 400 when it is not pending. */
    @PostMapping("/{id}/reject")
    fun reject(@PathVariable id: Long, @RequestHeader("X-User-Id", required = false) userId: Long?): RuleVersionJson =
        (rules.reject(id, knownUser(userId)) ?: throw notFound(id)).toJson()

    private fun knownUser(userId: Long?): AppUser =
        userId?.let(users::find) ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "X-User-Id names no known user")

    private fun notFound(id: Long) = ResponseStatusException(HttpStatus.NOT_FOUND, "rule version $id not found")

    /**
     * Starts replaying the period `from`..`to` (dates, inclusive) with the draft [id] in place of its active version,
     * in the background, in place of every stored backtest (ADR-0049). 202 with the summary, `status: RUNNING`; poll
     * `GET` until it is DONE or FAILED. 400 when [id] is not a draft or the period is backwards, 404 when there is none.
     */
    @PostMapping("/{id}/backtest")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun backtest(
        @PathVariable id: Long,
        @RequestParam from: LocalDate,
        @RequestParam to: LocalDate,
        @RequestHeader("X-User-Id", required = false) userId: Long?,
    ): Backtest = backtests.start(id, from, to, userId) ?: throw notFound(id)

    /** The draft's stored backtest, running or done; 404 when it has none (never run, replaced, or its draft left draft). */
    @GetMapping("/{id}/backtest")
    fun backtestSummary(@PathVariable id: Long): Backtest =
        backtests.summary(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "rule version $id has no backtest")

    /** A page of the stored backtest's rows in `view` (`all`, `changed`, `new`, `dropped`), in its order. */
    @GetMapping("/{id}/backtest/rows")
    fun backtestRows(
        @PathVariable id: Long,
        @RequestParam(defaultValue = "all") view: String,
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "100") size: Int,
    ): BacktestRows {
        if (view !in BacktestRepository.VIEWS) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "view is one of ${BacktestRepository.VIEWS.keys}")
        if (page < 0 || size !in 1..500) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "page >= 0, size 1..500")
        return backtests.rows(id, view, page, size)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "rule version $id has no backtest")
    }

    /** Explains a rule as it would be saved, without saving it; 400 like a save, 502 when the model gives no usable answer. */
    @PostMapping("/explanation")
    fun explain(@RequestBody body: RuleBody): ExplanationJson {
        val explanation = rules.preview(body.toNewRule()) ?: throw ExplanationUnavailableException()
        return ExplanationJson(explanation.text, explanation.modelId)
    }

    @ExceptionHandler(ExplanationUnavailableException::class)
    fun badGateway(e: ExplanationUnavailableException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, e.message)

    @ExceptionHandler(InvalidRuleException::class, RuleCompileException::class)
    fun badRequest(e: RuntimeException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message)

    @ExceptionHandler(NotAManagerException::class)
    fun forbidden(e: NotAManagerException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.message)

    @ExceptionHandler(DuplicateKeyException::class)
    fun conflict(e: DuplicateKeyException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "another version of this rule was saved at the same time; try again")
}
