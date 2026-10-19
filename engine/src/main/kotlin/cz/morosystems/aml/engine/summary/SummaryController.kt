package cz.morosystems.aml.engine.summary

import cz.morosystems.aml.engine.bedrock.BedrockException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/alerts/{id}/summary")
class SummaryController(private val summaries: SummaryService) {
    /** The alert's latest summary; 404 until one was generated. */
    @GetMapping
    fun latest(@PathVariable id: Long): Summary =
        summaries.latest(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "alert $id has no summary")

    /** Generates and stores a new summary. 502 when the model fails or its output does not pass the checks. */
    @PostMapping
    fun generate(@PathVariable id: Long): Summary = summaries.generate(id)

    @ExceptionHandler(AlertNotFoundException::class)
    fun notFound(e: AlertNotFoundException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message)

    @ExceptionHandler(InvalidSummaryException::class, BedrockException::class)
    fun badGateway(e: RuntimeException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, e.message)
}
