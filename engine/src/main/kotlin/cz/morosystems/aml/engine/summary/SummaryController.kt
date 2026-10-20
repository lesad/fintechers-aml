package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.bedrock.BedrockException
import cz.morosystems.aml.engine.suggestion.InvalidSuggestionException
import cz.morosystems.aml.engine.suggestion.Suggestion
import cz.morosystems.aml.engine.suggestion.SuggestionRequest
import cz.morosystems.aml.engine.suggestion.SuggestionService
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/** The rule change suggested from a reviewer's reason. The AI Rating has its own controller (AssessmentController). */
@RestController
@RequestMapping("/api/alerts/{id}")
class SummaryController(private val suggestions: SuggestionService) {
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
