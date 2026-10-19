package cz.morosystems.aml.engine.rules

import cz.morosystems.aml.engine.cel.RuleCompileException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

class ExplanationUnavailableException : RuntimeException("the model gave no usable explanation; try again")

@RestController
@RequestMapping("/api/rules")
class RuleController(private val rules: RuleService) {
    /** Every rule version, by key, newest version first. */
    @GetMapping
    fun all(): List<RuleVersionJson> = rules.all().map { it.toJson() }

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

    @ExceptionHandler(DuplicateKeyException::class)
    fun conflict(e: DuplicateKeyException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "another version of this rule was saved at the same time; try again")
}
