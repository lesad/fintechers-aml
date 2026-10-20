package cz.morosystems.aml.engine.triage

import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

/**
 * The triage policy as an API: every stored version, the live one, and a new draft. Nothing here re-triages — a new
 * version decides the next run, and the verdicts already written keep the config version they were taken under.
 */
@RestController
@RequestMapping("/api/triage")
class TriageConfigController(private val configs: TriageConfigService) {
    /** Every stored version, newest first. */
    @GetMapping("/configs")
    fun all(): List<TriageConfigVersionJson> = configs.all().map { it.toJson() }

    @GetMapping("/config")
    fun active(): TriageConfigVersionJson = configs.all().firstOrNull { it.status == "active" }?.toJson()
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "no triage config is active")

    @GetMapping("/config/{version}")
    fun find(@PathVariable version: Int): TriageConfigVersionJson =
        configs.find(version)?.toJson() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "triage config version $version not found")

    /** Saves the body as the next draft version; the version number is assigned here, never sent. */
    @PostMapping("/config")
    @ResponseStatus(HttpStatus.CREATED)
    fun save(@RequestBody body: TriageConfigBody): TriageConfigVersionJson = configs.save(body.toNewTriageConfig()).toJson()

    /** Promotes a version and retires the one that was active. The next run decides under it; nothing is re-triaged. */
    @PostMapping("/config/{version}/activate")
    fun activate(@PathVariable version: Int): TriageConfigVersionJson = configs.activate(version).toJson()

    /**
     * Rescores one rule. The config is insert-only, so this does not edit the active version: it derives the next
     * version from it, writes that one row, and activates it. The caller sends one field; the one it sends a key
     * the active version does not score yet is how that rule gets a score at all.
     */
    @PatchMapping("/config/rules/{ruleKey}")
    fun patchRuleScore(@PathVariable ruleKey: String, @RequestBody body: RuleScorePatchBody): TriageConfigVersionJson =
        configs.patchRuleScore(ruleKey, body.toRuleTriage(), body.author).toJson()

    /**
     * Changes any subset of the rule-agnostic numbers. Like the rule patch, this creates and activates a new
     * version rather than editing one — an omitted number is left as the active version has it.
     */
    @PatchMapping("/config/factors")
    fun patchFactors(@RequestBody body: FactorsPatchBody): TriageConfigVersionJson =
        configs.patchFactors(body.toPatch(), body.author).toJson()

    /** Which live rules the active config does not score, and which scores no live rule uses. */
    @GetMapping("/coverage")
    fun coverage(): CoverageJson = configs.coverage().toJson()

    @ExceptionHandler(InvalidTriageConfigException::class)
    fun badRequest(e: InvalidTriageConfigException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.message)

    @ExceptionHandler(DuplicateKeyException::class)
    fun conflict(e: DuplicateKeyException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "another triage config version was saved at the same time; try again")

    /**
     * A check constraint the schema enforces and Kotlin does not — a negative `perExtraRule`, say — is still the
     * caller's bad request, not a server fault. [DuplicateKeyException] is the more specific match and keeps its 409.
     */
    @ExceptionHandler(DataIntegrityViolationException::class)
    fun constraintViolation(e: DataIntegrityViolationException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "the triage config violates a stored constraint: ${e.mostSpecificCause.message}")
}
