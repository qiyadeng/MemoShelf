import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";
import type { Command, Library, SyncResult } from "../../shared/types";

export type { Command, Library }
// Initialize and export the database connection
let db: Database.Database | null = null;
export function initializeDatabase() {
    console.log('Initializing database...')
    // get the path where electron stores user data
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'snipforge.db')
    console.log('Database path:', dbPath)
try {
    //create or open the database
    db = new Database(dbPath)
    // Enable WAL mode for better read performance
    db.pragma('journal_mode = WAL')
    // Create the commands table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            description TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            language TEXT DEFAULT 'plaintext',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Performance indices for frequently queried columns
        CREATE INDEX IF NOT EXISTS idx_commands_title ON commands(title);
        CREATE INDEX IF NOT EXISTS idx_commands_updated_at ON commands(updated_at DESC);
    `)

    // Add description column to existing tables (migration)
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN description TEXT DEFAULT ''`)
        console.log('Added description column to existing database')
    } catch (error) {
        // Column already exists or other error, ignore
        console.log('Description column already exists or table is new')
    }

    // Add language column to existing tables (migration)
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN language TEXT DEFAULT 'plaintext'`)
        console.log('Added language column to existing database')
    } catch (error) {
        // Column already exists or other error, ignore
        console.log('Language column already exists or table is new')
    }

    // Remote library migrations
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`)
        console.log('Added source column to commands')
    } catch { /* already exists */ }

    try {
        db.exec(`ALTER TABLE commands ADD COLUMN library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE`)
        console.log('Added library_id column to commands')
    } catch { /* already exists */ }

    try {
        db.exec(`ALTER TABLE commands ADD COLUMN remote_path TEXT`)
        console.log('Added remote_path column to commands')
    } catch { /* already exists */ }

    // Libraries table
    db.exec(`
        CREATE TABLE IF NOT EXISTS libraries (
            id INTEGER PRIMARY KEY,
            github_repo TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            last_synced_at TEXT,
            last_synced_sha TEXT,
            created_at TEXT NOT NULL
        );
    `)

    // Auth token storage
    db.exec(`
        CREATE TABLE IF NOT EXISTS auth (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `)

    // Library manifest_path migration
    try {
        db.exec(`ALTER TABLE libraries ADD COLUMN manifest_path TEXT`)
        // Backfill: existing libraries with a synced SHA are already initialized
        db.exec(`UPDATE libraries SET manifest_path = '.snipforge.json' WHERE last_synced_sha IS NOT NULL AND manifest_path IS NULL`)
        console.log('Added manifest_path column to libraries')
    } catch { /* already exists */ }

    // Index for fast remote command lookups
    db.exec(`CREATE INDEX IF NOT EXISTS idx_commands_library_id ON commands(library_id);`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_commands_source ON commands(source);`)

    console.log('Database table created successfully')
    return db
    }catch (error) {
        console.error('Error initializing database:', error)
        throw error
    }
}
// Close the database connection
export function closeDatabase(): void {
    if (db) {
        db.close()
        db = null
        console.log('Database closed')
    }
}

// Function to get all commands from DB
export function getAllCommands(): Command[] {
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare("SELECT * FROM commands ORDER BY updated_at DESC");
    return stmt.all() as Command[];
}
//update a command in DB
export function updateCommand(id: number, updates: Partial<Command>): boolean{
    if (!db) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, description = ?, tags = ?, language = ?, updated_at = ?,
            source = 'local', library_id = NULL, remote_path = NULL
        WHERE id = ?
    `);
    const result = stmt.run(
        updates.title || '',
        updates.body || '',
        updates.description || '',
        updates.tags || '[]',
        updates.language || 'plaintext',
        now,
        id
    );
    return result.changes > 0;
}
// delete command from DB
export function deleteCommand(id: number): boolean {
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare("DELETE FROM commands WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
}
// add a new command to DB
export function addCommand(command: Omit<Command, 'id' | 'created_at' | 'updated_at'>): number {
    if (!db) throw new Error("Database not initialized");
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        command.title,
        command.body,
        command.description || '',
        command.tags || '[]',
        command.language || 'plaintext',
        now,
        now
    );
    return result.lastInsertRowid as number;
}
// test data function
export function seedTestData(): void {
    if (!db) throw new Error("Database not initialized");
    // check if we already have data
    const existingCommands = getAllCommands()
    if (existingCommands.length > 0) {
        console.log('Database already has data, skipping seeding.')
        return
    }

    console.log('Seeding database with test data...')

    //prepare the insert statement
    const insertCommand = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()

    //sample welcome command
    insertCommand.run(
        'Welcome to SnipForge!',
        'You can create snippets in plain text or markdown, and add variables with the following syntax {{variable name}}. Read the help section for more.',
        'This section is used to describe your snippets and it also supports markdown, cool right?',
        '["snipforge", "by_artluxdm"]',
        'markdown',
        now,
        now
    )

    console.log('✅ Test data added successfully')
}

// ── Library functions ──────────────────────────────────────────────

export function getAllLibraries(): Library[] {
    if (!db) throw new Error("Database not initialized")
    return db.prepare("SELECT * FROM libraries ORDER BY created_at DESC").all() as Library[]
}

export function getLibraryByRepo(githubRepo: string): Library | undefined {
    if (!db) throw new Error("Database not initialized")
    return db.prepare("SELECT * FROM libraries WHERE github_repo = ?").get(githubRepo) as Library | undefined
}

export function addLibrary(githubRepo: string, name: string, description: string, manifestPath?: string): number {
    if (!db) throw new Error("Database not initialized")
    const now = new Date().toISOString()
    const result = db.prepare(`
        INSERT INTO libraries (github_repo, name, description, manifest_path, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(githubRepo, name, description, manifestPath ?? null, now)
    return result.lastInsertRowid as number
}

export function updateLibrarySync(libraryId: number, sha: string): void {
    if (!db) throw new Error("Database not initialized")
    const now = new Date().toISOString()
    db.prepare(`
        UPDATE libraries SET last_synced_at = ?, last_synced_sha = ? WHERE id = ?
    `).run(now, sha, libraryId)
}

export function updateLibraryManifest(libraryId: number, name: string, description: string, manifestPath: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare(`
        UPDATE libraries SET name = ?, description = ?, manifest_path = ? WHERE id = ?
    `).run(name, description, manifestPath, libraryId)
}

export function clearLibraryManifest(libraryId: number): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare(`
        UPDATE libraries SET manifest_path = NULL, last_synced_sha = NULL WHERE id = ?
    `).run(libraryId)
}

export function deleteLibrary(libraryId: number): void {
    if (!db) throw new Error("Database not initialized")
    // Delete remote commands first (CASCADE should handle this, but be explicit)
    db.prepare("DELETE FROM commands WHERE library_id = ?").run(libraryId)
    db.prepare("DELETE FROM libraries WHERE id = ?").run(libraryId)
}

// ── Remote command functions ──────────────────────────────────────

export function getLocalCommandBodies(): Set<string> {
    if (!db) throw new Error("Database not initialized")
    const rows = db.prepare(
        "SELECT body FROM commands WHERE source = 'local'"
    ).all() as Array<{ body: string }>
    return new Set(rows.map(r => r.body.trim()))
}

export function getRemoteCommands(libraryId: number): Command[] {
    if (!db) throw new Error("Database not initialized")
    return db.prepare(
        "SELECT * FROM commands WHERE library_id = ? AND source = 'remote'"
    ).all(libraryId) as Command[]
}

export function addRemoteCommand(
    libraryId: number,
    remotePath: string,
    command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string }
): number {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, source, library_id, remote_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'remote', ?, ?, ?, ?)
    `).run(
        command.title,
        command.body,
        command.description,
        command.tags,
        command.language,
        libraryId,
        remotePath,
        command.created_at,
        command.updated_at
    )
    return result.lastInsertRowid as number
}

export function updateRemoteCommand(
    libraryId: number,
    remotePath: string,
    command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string }
): boolean {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, description = ?, tags = ?, language = ?, updated_at = ?
        WHERE library_id = ? AND remote_path = ? AND source = 'remote'
    `).run(
        command.title,
        command.body,
        command.description,
        command.tags,
        command.language,
        command.updated_at,
        libraryId,
        remotePath
    )
    return result.changes > 0
}

export function deleteRemoteCommand(libraryId: number, remotePath: string): boolean {
    if (!db) throw new Error("Database not initialized")
    const result = db.prepare(
        "DELETE FROM commands WHERE library_id = ? AND remote_path = ? AND source = 'remote'"
    ).run(libraryId, remotePath)
    return result.changes > 0
}

// Batch sync: runs all add/update/remove in a single transaction
export function syncRemoteCommands(
    libraryId: number,
    sha: string,
    toAdd: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string } }>,
    toUpdate: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string } }>,
    toRemove: string[]
): SyncResult {
    if (!db) throw new Error("Database not initialized")
    const errors: string[] = []

    const transaction = db.transaction(() => {
        for (const item of toAdd) {
            try {
                addRemoteCommand(libraryId, item.remotePath, item.command)
            } catch (e) {
                errors.push(`Failed to add ${item.remotePath}: ${(e as Error).message}`)
            }
        }
        for (const item of toUpdate) {
            try {
                updateRemoteCommand(libraryId, item.remotePath, item.command)
            } catch (e) {
                errors.push(`Failed to update ${item.remotePath}: ${(e as Error).message}`)
            }
        }
        for (const remotePath of toRemove) {
            try {
                deleteRemoteCommand(libraryId, remotePath)
            } catch (e) {
                errors.push(`Failed to remove ${remotePath}: ${(e as Error).message}`)
            }
        }
        updateLibrarySync(libraryId, sha)
    })

    transaction()

    return {
        added: toAdd.length,
        updated: toUpdate.length,
        removed: toRemove.length,
        errors
    }
}

// ── Auth storage (encrypted tokens) ──────────────────────────────

export function getAuthValue(key: string): string | null {
    if (!db) throw new Error("Database not initialized")
    const row = db.prepare("SELECT value FROM auth WHERE key = ?").get(key) as { value: string } | undefined
    return row?.value ?? null
}

export function setAuthValue(key: string, value: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)").run(key, value)
}

export function deleteAuthValue(key: string): void {
    if (!db) throw new Error("Database not initialized")
    db.prepare("DELETE FROM auth WHERE key = ?").run(key)
}