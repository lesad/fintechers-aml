package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.ai.AiResult
import cz.morosystems.aml.engine.bedrock.BedrockException
import cz.morosystems.aml.engine.suggestion.InvalidSuggestionException
import cz.morosystems.aml.engine.suggestion.Suggestion
import cz.morosystems.aml.engine.suggestion.SuggestionRequest
import cz.morosystems.aml.engine.suggestion.SuggestionService
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/** The model-backed endpoints of an alert: its summary, and a rule change suggested from a reviewer's reason. */
@RestController
@RequestMapping("/api/alerts/{id}")
class SummaryController(private val summaries: SummaryService, private val suggestions: SuggestionService) {
    /** The alert's latest summary; 404 until one was generated. */
    @GetMapping("/summary")
    fun latest(@PathVariable id: Long): AiResult =
        summaries.latest(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "alert $id has no summary")

    /** Generates and stores a new summary: `ready`, `rejected` when the reply fails the checks, `failed` when the model does (ADR-0043). */
    @PostMapping("/summary")
    fun generate(@PathVariable id: Long): AiResult = summaries.generate(id)

    /** Suggests a rule change for a false-positive reason; stores nothing. 400 for a blank or overlong reason, 502 when the model fails or its output does not pass the checks. */
    @PostMapping("/suggestion")
    fun suggest(@PathVariable id: Long, @RequestBody request: SuggestionRequest): Suggestion {
        val reason = request.reason?.trim().orEmpty()
        if (reason.isEmpty()) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "reason is required")
        if (reason.length > MAX_REASON) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "reason is over $MAX_REASON characters")
        return suggestions.suggest(id, reason)
    }

    @ExceptionHandler(AlertNotFoundException::class)
    fun notFound(e: AlertNotFoundException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message)

    @ExceptionHandler(InvalidSummaryException::class, InvalidSuggestionException::class, BedrockException::class)
    fun badGateway(e: RuntimeException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, e.message)
}

private const val MAX_REASON = 2000
