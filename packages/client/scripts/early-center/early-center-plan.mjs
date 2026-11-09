const NEUTRAL = "0x0000000000000000000000000000000000000000";

export function canSendFleet(fromLevel, toLevel) {
  return toLevel >= fromLevel - 1;
}

export function canSendRoute(from, to) {
  return (
    canSendFleet(from.level, to.level) &&
    (from.level !== to.level ||
      to.x ** 2 + to.y ** 2 < from.x ** 2 + from.y ** 2)
  );
}

const distanceBetween = (from, to) => Math.hypot(from.x - to.x, from.y - to.y);

function availableToSend(from, energy) {
  // Excess energy from reinforcements can decay before submission.
  return (from.growth > 0 ? Math.min(energy, from.cap) : energy) - 1;
}

function isFull(planet) {
  return planet.cap > 1 && planet.energy >= planet.cap - 1;
}

function estimateArrival(from, sent, distance) {
  return Math.floor(
    sent * 2 ** (-Math.ceil(distance) / from.range) - from.cap / 20,
  );
}

function routePreferences(from, targets, energy) {
  let nearest = Infinity;
  let oneLevelUp = Infinity;
  let twoLevelsUp = Infinity;
  for (const target of targets) {
    const difference = target.level - from.level;
    if (difference <= 0) continue;
    const distance = distanceBetween(from, target);
    nearest = Math.min(nearest, distance);
    if (difference === 1) oneLevelUp = Math.min(oneLevelUp, distance);
    if (difference === 2) twoLevelsUp = Math.min(twoLevelsUp, distance);
  }
  const sent = availableToSend(from, energy);
  const canFallBack =
    Number.isFinite(nearest) &&
    sent > 0 &&
    estimateArrival(from, sent, nearest) * 10 < sent;
  const skipOneLevel =
    Number.isFinite(twoLevelsUp) && twoLevelsUp * 2 <= oneLevelUp;
  return {
    allows(target) {
      return (
        canSendRoute(from, target) && (target.level > from.level || canFallBack)
      );
    },
    priority(target) {
      const difference = target.level - from.level;
      if (difference <= 0) return difference === 0 ? 10 : 11;
      const upwardPriority =
        skipOneLevel && difference <= 2 ? 3 - difference : difference;
      return (canFallBack ? 20 : 0) + upwardPriority;
    },
  };
}

export function remainingGarrison(planet, player) {
  const incoming = planet.incoming ?? [];
  if (
    incoming.length !== (planet.pending ?? 0) ||
    incoming.some((fleet) => fleet.captain !== player)
  ) {
    return null;
  }
  const damage = incoming.reduce(
    (sum, fleet) => sum + Math.floor((fleet.energy * 100) / planet.defense),
    0,
  );
  return Math.max(0, planet.energy - damage);
}

function voyage(from, to, energy) {
  if (!canSendRoute(from, to) || from.range <= 0 || from.speed <= 0)
    return null;
  const proofDistance = Math.ceil(distanceBetween(from, to));
  const sent = availableToSend(from, energy);
  const arriving = estimateArrival(from, sent, proofDistance) - 1;
  if (arriving < 1) return null;
  return {
    proofDistance,
    sent,
    arriving,
    travelTicks: Math.floor((proofDistance * 100) / from.speed),
  };
}

function capture(from, to, energy) {
  const leg = voyage(from, to, energy);
  if (!leg) return null;
  const seed = leg.arriving - Math.ceil((to.energy * to.defense) / 100);
  return seed >= Math.max(1, Math.ceil(to.cap / 100)) ? { ...leg, seed } : null;
}

function attack(from, to, energy, garrison) {
  const leg = voyage(from, to, energy);
  if (!leg) return null;
  const damage = Math.floor((leg.arriving * 100) / to.defense);
  if (damage === 0 && garrison > 0) return null;
  return attackOutcome({ ...leg, damage }, to, garrison);
}

function attackOutcome(leg, to, garrison) {
  const captures = leg.damage >= garrison;
  const seed = captures
    ? Math.max(1, leg.arriving - Math.floor((garrison * to.defense) / 100))
    : 0;
  return { ...leg, garrison, captures, seed };
}

export function cargoFits(target, silver, materials, travelTicks) {
  const growth = (target.silverGrowth ?? 0) * travelTicks;
  const cap = target.silverCap ?? 0;
  if (silver && silver > Math.max(0, cap - (target.silver ?? 0) - growth))
    return false;
  return materials.every(({ resourceId, amount }) => {
    const material = target.materials?.find(
      (item) => item.resourceId === resourceId,
    );
    const projected = (material?.amount ?? 0) + (material?.grows ? growth : 0);
    return amount <= Math.max(0, cap - projected);
  });
}

export function cargoReplenished(planet, elapsed) {
  const grown = planet.silverGrowth * elapsed;
  return (
    planet.silver > grown ||
    planet.materials.some((item) => item.amount > (item.grows ? grown : 0))
  );
}

function evacuation(from, receivers) {
  const silver = from.silver ?? 0;
  const materials = (from.materials ?? []).filter(({ amount }) => amount > 0);
  const targets = receivers.filter(
    (target) =>
      target.radius < from.radius &&
      !target.pending &&
      !target.effects &&
      target.growth,
  );
  const preferences = routePreferences(from, targets, from.energy);
  const routes = [];
  for (const target of targets) {
    if (!preferences.allows(target)) continue;
    const leg = voyage(from, target, from.energy);
    if (
      !leg?.travelTicks ||
      !cargoFits(target, silver, materials, leg.travelTicks)
    )
      continue;
    routes.push({
      action: "move",
      purpose: "evacuate",
      from,
      target,
      ...leg,
      silver,
      materials,
    });
  }
  return routes.sort(
    (a, b) =>
      preferences.priority(a.target) - preferences.priority(b.target) ||
      b.arriving - a.arriving ||
      a.target.radius - b.target.radius,
  )[0];
}

function recoveryTicks(planet, start, target) {
  if (start >= target) return 0;
  const { cap, growth } = planet;
  return Math.ceil(
    (cap / (4 * growth)) * Math.log((cap / start - 1) / (cap / target - 1)),
  );
}

export function planCenterAdvance({
  planets,
  player,
  tickRate,
  paused,
  innerRadius,
  radius,
  junkFree,
  evacuations = new Map(),
}) {
  const actions = [];
  if (paused || tickRate === 0) return { actions, reason: "ticker-paused" };

  const owned = planets.filter((p) => p.owner === player && !p.destroyed);
  const registered = owned.filter((p) => p.junkOwner === player);
  const sources = registered.filter(
    (p) =>
      p.energy > 1 &&
      p.range > 0 &&
      p.speed > 0 &&
      !p.effects &&
      !p.pending &&
      !evacuations.has(p.hash),
  );
  const frontier = Math.min(...registered.map((p) => p.radius));

  const targets = planets.filter(
    (p) =>
      p.owner === NEUTRAL &&
      !p.destroyed &&
      (p.pending ?? 0) < 30 &&
      p.radius >= innerRadius &&
      p.radius < radius &&
      p.growth > 0 &&
      !p.effects &&
      p.defense > 0,
  );
  const garrisons = new Map();
  for (const target of targets) {
    const garrison = remainingGarrison(target, player);
    if (garrison !== null && (!target.pending || garrison > 0))
      garrisons.set(target.hash, garrison);
  }
  const attackTargets = targets.filter((target) => garrisons.has(target.hash));

  // A relay can advance the frontier or open a route to a higher level.
  const nextLegs = new Map();
  function nextLeg(relay) {
    if (nextLegs.has(relay.hash)) return nextLegs.get(relay.hash);
    const readyEnergy = Math.floor(relay.cap * 0.65);
    const candidates = attackTargets.filter(
      (target) => target.hash !== relay.hash && !target.pending,
    );
    const preferences = routePreferences(relay, candidates, readyEnergy);
    let best = null;
    for (const next of candidates) {
      if (!preferences.allows(next)) continue;
      const gain = Math.min(frontier, relay.radius) - next.radius;
      if (gain <= 0 && next.level <= relay.level) continue;
      const leg = capture(relay, next, readyEnergy);
      if (
        leg &&
        (!best ||
          preferences.priority(next) < preferences.priority(best.target) ||
          (preferences.priority(next) === preferences.priority(best.target) &&
            gain > best.gain))
      )
        best = { target: next, gain, readyEnergy, ...leg };
    }
    nextLegs.set(relay.hash, best);
    return best;
  }

  const claimable = owned.filter((p) => p.junkOwner !== player && !p.pending);
  claimable.sort(
    (a, b) => b.level - a.level || a.radius - b.radius || b.range - a.range,
  );
  const claims = claimable.filter(
    (p) =>
      p.growth > 0 &&
      (p.radius < frontier ||
        !sources.length ||
        registered.some((base) => p.level > base.level) ||
        nextLeg(p)),
  );
  const attacks = [];
  const reinforcements = [];
  const receivers = registered.filter(
    (p) =>
      p.radius >= innerRadius &&
      p.radius < radius &&
      p.growth > 0 &&
      !p.pending &&
      !p.effects &&
      !isFull(p) &&
      !evacuations.has(p.hash),
  );
  for (const from of sources) {
    const full = isFull(from);
    const candidates = full ? [...attackTargets, ...receivers] : attackTargets;
    const preferences = routePreferences(from, candidates, from.energy);
    for (const target of attackTargets) {
      if (!preferences.allows(target)) continue;
      const garrison = garrisons.get(target.hash);
      const leg = attack(from, target, from.energy, garrison);
      if (!leg) continue;
      const gain = frontier - target.radius;
      const higherLevel = target.level > from.level;
      if (
        gain <= 0 &&
        !higherLevel &&
        !full &&
        (target.range <= from.range || target.radius > from.radius + from.range)
      )
        continue;
      const onward = leg.captures ? nextLeg(target) : null;
      if (gain <= 0 && !higherLevel && !full && !onward) continue;
      const recovery = onward
        ? recoveryTicks(target, leg.seed, onward.readyEnergy)
        : 0;
      const progress =
        Math.max(0, gain) + 0.65 * Math.max(0, onward?.gain ?? 0);
      const elapsed =
        leg.travelTicks + 0.65 * (recovery + (onward?.travelTicks ?? 0));
      const score = progress / (30 + elapsed / tickRate);
      attacks.push({
        action: "move",
        from,
        target,
        ...leg,
        full,
        priority: preferences.priority(target),
        junkCost: leg.captures && target.junkOwner !== player ? target.junk : 0,
        garrison,
        score,
        inwardGain: Math.round(gain),
        nextHop: onward?.target ?? null,
        nextHopReadySeconds: onward
          ? Math.ceil((leg.travelTicks + recovery) / tickRate)
          : null,
      });
    }
    if (full) {
      for (const target of receivers) {
        if (!preferences.allows(target)) continue;
        const leg = voyage(from, target, from.energy);
        if (!leg) continue;
        reinforcements.push({
          action: "move",
          purpose: "reinforce",
          from,
          target,
          ...leg,
          junkCost: 0,
          priority: preferences.priority(target),
          usable: Math.min(leg.arriving, target.cap - target.energy),
        });
      }
    }
  }
  attacks.sort(
    (a, b) =>
      a.priority - b.priority ||
      b.target.level - a.target.level ||
      Number(b.captures) - Number(a.captures) ||
      b.score - a.score ||
      b.damage / Math.max(1, b.garrison) - a.damage / Math.max(1, a.garrison) ||
      a.travelTicks - b.travelTicks ||
      b.seed - a.seed,
  );
  reinforcements.sort(
    (a, b) =>
      a.priority - b.priority ||
      b.usable - a.usable ||
      a.travelTicks - b.travelTicks,
  );
  const intents = [
    ...attacks.filter((action) => action.full),
    ...reinforcements,
    ...claims.map((target) => ({
      action: "add-junk",
      target,
      reason: "register-forward-relay",
    })),
    ...attacks.filter((action) => !action.full),
  ];
  const occupied = new Set();
  const attacked = new Map();
  const receiving = new Set([...evacuations.values()].map(({ to }) => to));
  const outer = registered
    .filter(
      (p) =>
        p.radius > frontier &&
        !p.pending &&
        !p.effects &&
        !p.artifacts &&
        !receiving.has(p.hash),
    )
    .sort((a, b) => b.radius - a.radius);
  let quotaBlocked = false;
  const scheduledEvacuations = new Set();
  for (const candidate of intents) {
    let intent = candidate;
    const earlier = attacked.get(intent.target.hash);
    const canJoin = intent.full && earlier?.garrison > 0 && earlier.fleets < 30;
    if (
      (occupied.has(intent.target.hash) && !canJoin) ||
      (intent.from && occupied.has(intent.from.hash))
    )
      continue;
    if (canJoin) {
      intent = attackOutcome(intent, intent.target, earlier.garrison);
      intent.junkCost =
        intent.captures && intent.target.junkOwner !== player
          ? intent.target.junk
          : 0;
      if (!intent.captures) {
        intent.nextHop = null;
        intent.nextHopReadySeconds = null;
      }
    }
    const junkCost = intent.junkCost ?? intent.target.junk;
    if (junkCost > 0 && junkCost > junkFree) {
      const excluded = new Set([intent.from?.hash, intent.target.hash]);
      const releasable = [];
      let projectedRelease = 0;
      let awaitingEvacuation = false;
      for (const p of outer) {
        if (junkFree + projectedRelease >= junkCost) break;
        const scheduled = scheduledEvacuations.has(p.hash);
        if (excluded.has(p.hash) || (occupied.has(p.hash) && !scheduled))
          continue;
        const shipment = evacuations.get(p.hash);
        const empty =
          p.energy <= 1 &&
          !p.silver &&
          !(p.materials ?? []).some(({ amount }) => amount);
        if (
          shipment?.status === "ready" ||
          (!shipment && !scheduled && empty)
        ) {
          releasable.push({ action: "clear-junk", target: p, shipment });
        } else if (shipment || scheduled) {
          awaitingEvacuation = true;
        } else {
          const transfer = evacuation(
            p,
            registered.filter(
              (receiver) =>
                receiver.radius >= innerRadius &&
                !occupied.has(receiver.hash) &&
                !evacuations.has(receiver.hash) &&
                !releasable.some(
                  (action) => action.target.hash === receiver.hash,
                ),
            ),
          );
          if (!transfer) continue;
          actions.push(transfer);
          occupied.add(p.hash);
          occupied.add(transfer.target.hash);
          scheduledEvacuations.add(p.hash);
          awaitingEvacuation = true;
        }
        projectedRelease += p.junk;
      }
      if (awaitingEvacuation || junkFree + projectedRelease < junkCost) {
        quotaBlocked = true;
        continue;
      }
      const dependencies = [];
      for (const action of releasable) {
        dependencies.push(actions.length);
        actions.push(action);
        occupied.add(action.target.hash);
        junkFree += action.target.junk;
      }
      intent.dependsOn = dependencies;
    }
    actions.push(intent);
    if (intent.damage !== undefined) {
      attacked.set(intent.target.hash, {
        garrison: Math.max(0, intent.garrison - intent.damage),
        fleets: (earlier?.fleets ?? intent.target.pending ?? 0) + 1,
      });
    }
    occupied.add(intent.target.hash);
    if (intent.from) occupied.add(intent.from.hash);
    junkFree -= junkCost;
  }
  return {
    actions,
    fullWaiting: registered.filter(
      (p) =>
        isFull(p) && !actions.some((action) => action.from?.hash === p.hash),
    ),
    reason: actions.length
      ? undefined
      : quotaBlocked
        ? "junk-quota-awaiting-evacuation"
        : sources.length
          ? "no-profitable-inward-route"
          : "no-ready-source",
  };
}
