import bcrypt from 'bcrypt'
import { getUserByUsername } from './dbService'
import { log } from '../utils/general'

/**
 * Validates user credentials asynchronously against the database.
 * @param username - The username to validate
 * @param password - The plaintext password to verify
 * @returns A promise that resolves to true if credentials are valid, false otherwise
 */
export async function validateCredentials(
  username: string,
  password: string
): Promise<boolean> {
  try {
    const user = await getUserByUsername(username)
    if (!user) {
      log('warn', `Unknown user: ${username}`)
      return false
    }
    const match = await bcrypt.compare(password, user.passwordHash)
    if (match) {
      log('info', `Valid credentials for ${username}`)
      return true
    } else {
      log('warn', `Invalid password for ${username}`)
      return false
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log('error', `Error validating credentials for ${username}: ${msg}`, error)
    return false
  }
}