export function getTransType({action, currency}) {
  return action && currency ? `${action}_${currency}` : null;
}

export function destructTransType(transType) {
  const currency = transType.split('_')[1]
  const action = transType.split('_')[0]
  return {action,currency}
}


export function isMatching(offer1, offer2) {
  const rateMargin = 0.2; //20%
  const amountMargin = 0.5; //50%
  const rateMatch = Math.abs(offer1.rate - offer2.rate) / offer1.rate <= rateMargin;
  const amountMatch = Math.abs(offer1.amount - offer2.amount) / offer1.amount <= amountMargin;
  return rateMatch && amountMatch;
}