import { useEffect, useState } from 'react';
import { RelationshipService, RelationshipState } from '../services/relationship';

/**
 * App-wide linking state. Use this instead of reading `profile.partnerName`
 * directly — `isLinked` is the only reliable "do I actually have a partner?"
 * signal (never a phantom "Partner").
 *
 * Example:
 *   const { isLinked, partnerName } = useRelationship();
 *   if (!isLinked) return <InvitePartnerCta />;
 */
export function useRelationship(): RelationshipState {
  const [snapshot, setSnapshot] = useState<RelationshipState>(() => RelationshipService.get());

  useEffect(() => {
    const unsubscribe = RelationshipService.subscribe(setSnapshot);
    // Kick an authoritative refresh; de-duped inside the service.
    void RelationshipService.refresh();
    return unsubscribe;
  }, []);

  return snapshot;
}
