// Pure shared recovery policy. No network, no financial writes, no implicit retries.
export function nextDeliveryStage(record, proof, now) {
  if (!record || !proof || !Number.isFinite(now) || record.eventId!==proof.eventId ||
      record.recipientId!==proof.recipientId || record.messageId!==proof.messageId ||
      !record.eventId || !record.recipientId || !record.messageId ||
      proof.authorized!==true || proof.messageLive!==true || proof.revisionMatch!==true)
    return "blocked";
  if (proof.mediaLive===true && proof.objectLive===true && proof.assetMatches===true)
    return "attached";
  if (proof.mediaLive===true || proof.attachedAck===true) return "review";
  if (proof.leaseActive===true) return "wait";
  if (proof.objectLive===true) return proof.assetMatches===true && proof.pngVerified===true ? "attach_existing" : "review";
  if (proof.objectLive!==false) return "review";
  return proof.snapshotVerified===true ? "render_original" : "review";
}
export function pushRecovery(record, proof, now) {
  if (!record || !proof || !Number.isFinite(now) || proof.eventId!==record.eventId ||
      proof.recipientId!==record.recipientId || !record.eventId || !record.recipientId ||
      proof.authorized!==true || proof.messageLive!==true) return "blocked";
  if (proof.providerConfirmed===true) return "acknowledge";
  if (record.state==="sent") return "review";
  if (record.state==="processing" && (!Number.isFinite(record.leaseUntil)||record.leaseUntil>now)) return "wait";
  if (proof.providerNotSent===true && proof.fencedAttempt===true &&
      Number.isSafeInteger(record.attempts) && record.attempts>=0 && record.attempts<3) return "retry";
  return "review";
}
