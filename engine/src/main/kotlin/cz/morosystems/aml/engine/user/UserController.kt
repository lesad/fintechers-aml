package cz.morosystems.aml.engine.user

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/users")
class UserController(private val users: UserRepository) {
    /** Everyone who can work the queue; the UI picks one and sends its id as `X-User-Id`. */
    @GetMapping
    fun list(): List<AppUser> = users.all()
}
