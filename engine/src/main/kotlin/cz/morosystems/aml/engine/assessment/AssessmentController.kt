package cz.morosystems.aml.engine.assessment

import cz.morosystems.aml.engine.ai.AiResult
import cz.morosystems.aml.engine.summary.AlertNotFoundException
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
@RequestMapping("/api/alerts/{id}/assessment")
class AssessmentController(private val assessments: AssessmentService) {
    /** The alert's latest AI assessment; 404 until one was generated. */
    @GetMapping
    fun latest(@PathVariable id: Long): AiResult =
        assessments.latest(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "alert $id has no assessment")

    /** Generates and stores a new assessment: `ready`, `rejected` when the reply fails the checks, `failed` when the model does (ADR-0043). */
    @PostMapping
    fun generate(@PathVariable id: Long): AiResult = assessments.generate(id)

    @ExceptionHandler(AlertNotFoundException::class)
    fun notFound(e: AlertNotFoundException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message)
}
