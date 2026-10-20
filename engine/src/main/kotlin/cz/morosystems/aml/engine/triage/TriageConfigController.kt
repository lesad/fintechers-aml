package cz.morosystems.aml.engine.triage

import cz.morosystems.aml.engine.user.AppUser
import cz.morosystems.aml.engine.user.COMPLIANCE_OFFICER
import cz.morosystems.aml.engine.user.UserRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

class NotAnActivatorException(message: String) : RuntimeException(message)

/**
 * The triage policy as an API: every stored version, the live one, and a new draft. Nothing here re-triages — a new
 * version decides the next run, and the verdicts already written keep the config version they were taken under.
 */
@RestController
@RequestMapping("/api/triage")
class TriageConfigController(private val configs: TriageConfigService, private val users: UserRepository) {
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

    /**
     * Promotes a version and retires the one that was active, for the compliance officer in `X-User-Id`; 403 for anyone
     * else or for the version's author. The next run decides under it; nothing is re-triaged.
     */
    @PostMapping("/config/{version}/activate")
    fun activate(@PathVariable version: Int, @RequestHeader("X-User-Id", required = false) userId: Long?): TriageConfigVersionJson {
        val officer = officer(userId)
        if (configs.find(version)?.author == officer.name) {
            throw NotAnActivatorException("${officer.name} wrote this version; another compliance officer activates it")
        }
        return configs.activate(version).toJson()
    }

    /**
     * The version still being decided — the draft someone is writing or the one waiting for its approver; 404 when
     * there is none. One at a time, so a proposal has a single identity.
     */
    @GetMapping("/config/open")
    fun open(): TriageConfigVersionJson =
        configs.open()?.toJson() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "no triage config is being decided")

    /**
     * Proposes a change as a draft (ADR-0056): the rules it rescores with their whole policy, plus any subset of the
     * rule-agnostic numbers. The config is insert-only, so this does not edit the active version — it writes the open
     * draft, or derives the next one from the active version — and it does **not** change what triage runs under:
     * only an approval does. Rescoring a key the active version does not score yet is how that rule gets a score.
     */
    @PostMapping("/config/draft")
    fun propose(@RequestBody body: TriageDraftBody): TriageConfigVersionJson =
        configs.propose(body.toChanges(), body.author).toJson()

    /**
     * Sends a draft for approval to `{"approverId": 3}`, or without a body to the first compliance officer who neither
     * wrote it nor sends it (the user in `X-User-Id`, when given).
     */
    @PostMapping("/config/{version}/submit")
    fun submit(
        @PathVariable version: Int,
        @RequestHeader("X-User-Id", required = false) userId: Long?,
        @RequestBody(required = false) body: SubmitBody?,
    ): TriageConfigVersionJson = (configs.submit(version, body?.approverId, userId?.let(users::find)) ?: throw notFound(version)).toJson()

    /**
     * Activates a pending version for the approver in `X-User-Id` and retires the one that was active; 403 for anyone
     * else or for its author, 400 when it is not pending. The next run decides under it; nothing is re-triaged.
     */
    @PostMapping("/config/{version}/approve")
    fun approve(@PathVariable version: Int, @RequestHeader("X-User-Id", required = false) userId: Long?): TriageConfigVersionJson =
        (configs.approve(version, knownUser(userId)) ?: throw notFound(version)).toJson()

    /** Sends a pending version back to draft for the approver in `X-User-Id`; 403 for anyone else, 400 when it is not pending. */
    @PostMapping("/config/{version}/reject")
    fun reject(@PathVariable version: Int, @RequestHeader("X-User-Id", required = false) userId: Long?): TriageConfigVersionJson =
        (configs.reject(version, knownUser(userId)) ?: throw notFound(version)).toJson()

    /** Deletes a draft; 400 for any other status, 404 when there is no such version. */
    @DeleteMapping("/config/{version}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable version: Int) {
        if (!configs.delete(version)) throw notFound(version)
    }

    /** Which live rules the active config does not score, and which scores no live rule uses. */
    @GetMapping("/coverage")
    fun coverage(): CoverageJson = configs.coverage().toJson()

    /** Only a compliance officer changes what triage runs under (ADR-0051). */
    private fun officer(userId: Long?) =
        userId?.let(users::find)?.takeIf { it.role == COMPLIANCE_OFFICER }
            ?: throw NotAnActivatorException("only a compliance officer can change the active triage config")

    private fun knownUser(userId: Long?): AppUser =
        userId?.let(users::find) ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "X-User-Id names no known user")

    private fun notFound(version: Int) = ResponseStatusException(HttpStatus.NOT_FOUND, "triage config version $version not found")

    @ExceptionHandler(NotAnActivatorException::class, NotAnApproverException::class)
    fun forbidden(e: RuntimeException): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.message)

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
