import { Effect } from "effect"
import { useUser } from "@clerk/nextjs"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { makeWatchlistService } from "@/lib/effect/watchlist-service"
import { useEffectResult } from "./use-effect-result"

export function useWatchlistGroupsEffect() {
  const { user } = useUser()
  const getGroupsQuery = useQuery(api.watchlists.getWatchlistGroups, user?.id ? { clerkId: user.id } : "skip")
  
  return useEffectResult(
    () => {
      const service = makeWatchlistService(user?.id, {
        getGroups: async () => getGroupsQuery || [],
        updateGroup: async () => {},
        deleteGroup: async () => {},
        getWatchlistByGroup: async () => []
      })
      
      return Effect.succeed(service).pipe(
        Effect.flatMap(s => s.getGroups())
      )
    },
    [user?.id, getGroupsQuery]
  )
}

export function useWatchlistOperations() {
  const { user } = useUser()
  const updateMutation = useMutation(api.watchlists.updateWatchlistGroup)
  const deleteMutation = useMutation(api.watchlists.deleteWatchlistGroup)
  const getWatchlistByGroupQuery = useQuery(api.watchlists.getWatchlistByGroup, "skip")
  
  const createService = (groupId?: string) => makeWatchlistService(user?.id, {
    getGroups: async () => [],
    updateGroup: async (id, updates) => {
      if (!user?.id) throw new Error("User not authenticated")
      await updateMutation({ 
        clerkId: user.id, 
        groupId: id as any,
        ...updates 
      })
    },
    deleteGroup: async (id) => {
      if (!user?.id) throw new Error("User not authenticated")
      await deleteMutation({ clerkId: user.id, groupId: id as any })
    },
    getWatchlistByGroup: async (id) => {
      if (!user?.id) return []
      // Use the query result if it matches the groupId
      return getWatchlistByGroupQuery || []
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

