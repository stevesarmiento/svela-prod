import { Effect } from "effect"
import { useUser } from "@clerk/nextjs"
import { makeWatchlistService } from "@/lib/effect/watchlist-service"
import { useEffectResult } from "./use-effect-result"
import { useDeleteWatchlistGroup, useUpdateWatchlistGroup } from "@/lib/convex-hooks"

export function useWatchlistGroupsEffect() {
  const { user } = useUser()
  // This hook is currently unused; keep behavior minimal and server-only.
  
  return useEffectResult(
    () => {
      const service = makeWatchlistService(user?.id, {
        getGroups: async () => {
          const response = await fetch("/api/internal/watchlists/groups")
          if (!response.ok) return []
          return await response.json()
        },
        updateGroup: async () => {},
        deleteGroup: async () => {},
        getWatchlistByGroup: async () => []
      })
      
      return Effect.succeed(service).pipe(
        Effect.flatMap(s => s.getGroups())
      )
    },
    [user?.id]
  )
}

export function useWatchlistOperations() {
  const { user } = useUser()
  const updateGroupMutation = useUpdateWatchlistGroup()
  const deleteGroupMutation = useDeleteWatchlistGroup()
  
  const createService = (groupId?: string) => makeWatchlistService(user?.id, {
    getGroups: async () => [],
    updateGroup: async (id, updates) => {
      if (!user?.id) throw new Error("User not authenticated")
      await updateGroupMutation(id as any, updates.name, updates.description, updates.icon, updates.color)
    },
    deleteGroup: async (id) => {
      if (!user?.id) throw new Error("User not authenticated")
      await deleteGroupMutation(id as any)
    },
    getWatchlistByGroup: async (id) => {
      if (!user?.id) return []
      const response = await fetch(`/api/internal/watchlists/items?groupId=${encodeURIComponent(id)}`)
      if (!response.ok) return []
      return await response.json()
    }
  })
  
  return {
    updateGroup: (groupId: string, name: string, description?: string, icon?: string, color?: string) => {
      const service = createService(groupId)
      return service.updateGroup(groupId, { name, description, icon, color })
    },
    deleteGroup: (groupId: string) => {
      const service = createService(groupId)
      return service.deleteGroup(groupId)
    },
    getCoinsForGroup: (groupId: string) => {
      const service = createService(groupId)
      return service.getCoinsForGroup(groupId)
    }
  }
}

