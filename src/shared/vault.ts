export interface VaultStatus {
  initialized: boolean
  unlocked: boolean
  browserConnected: boolean
}

export interface VaultAccount {
  id: string
  origin: string
  username: string
  autoFill: boolean
}

export interface VaultAccountInput {
  id?: string
  origin: string
  username: string
  password?: string
  autoFill: boolean
}
