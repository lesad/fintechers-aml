package cz.morosystems.aml.engine.importer

import cz.morosystems.aml.engine.user.UserRepository
import java.nio.file.Files
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException

/** The data import page: upload a transactions file, follow it, see past imports, clear the transactions. */
@RestController
class ImportController(private val imports: ImportService, private val jobs: ImportJobRepository, private val users: UserRepository) {

    /** Starts importing a ČNB transactions CSV (multipart field `file`); 202 with the job to poll. */
    @PostMapping("/api/imports")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun upload(@RequestParam file: MultipartFile, @RequestHeader("X-User-Id", required = false) userId: Long?): ImportJob {
        val user = knownUser(userId)
        if (file.isEmpty) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "the file is empty")
        val stored = Files.createTempFile("import-", ".csv")
        file.transferTo(stored)
        return imports.start(file.originalFilename ?: "upload.csv", stored, user)
    }

    /** The latest imports, newest first, the running one among them. */
    @GetMapping("/api/imports")
    fun list(): List<ImportJob> = jobs.latest(50)

    @GetMapping("/api/imports/{id}")
    fun job(@PathVariable id: Long): ImportJob = jobs.find(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "import $id not found")

    /** How many transactions and alerts a reset would delete. */
    @GetMapping("/api/data")
    fun counts(): Map<String, Long> = imports.counts()

    /** Deletes every transaction and its alerts; clients, rules, users and the import history stay. */
    @DeleteMapping("/api/data")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun reset(@RequestHeader("X-User-Id", required = false) userId: Long?) {
        knownUser(userId)
        imports.deleteTransactions()
    }

    @ExceptionHandler(ImportBusyException::class)
    @ResponseStatus(HttpStatus.CONFLICT)
    fun busy(e: ImportBusyException): Map<String, String?> = mapOf("message" to e.message)

    private fun knownUser(userId: Long?): Long =
        userId?.takeIf { users.exists(it) } ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "X-User-Id names no known user")
}
