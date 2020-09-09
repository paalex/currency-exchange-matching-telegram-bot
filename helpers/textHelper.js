import {BARANOVICHI, BOBRUYSK, BUY_EUR, BUY_USD, GRODNO, MINSK, SELL_EUR, SELL_USD} from "../constants/appEnums"
import {
  BARANOVICHI_WORD,
  BOBRUYSK_WORD,
  BUY_EUR_WORD,
  BUY_USD_WORD,
  GRODNO_WORD,
  MINSK_WORD, SELL_EUR_WORD, SELL_USD_WORD
} from "../constants/localizedStrings"

export function getCityWord(city) {
  let word;
  switch (city) {
    case MINSK:
      word = MINSK_WORD;
      break;
    case GRODNO:
      word = GRODNO_WORD;
      break;
    case BOBRUYSK:
      word = BOBRUYSK_WORD;
      break;
    case BARANOVICHI:
      word = BARANOVICHI_WORD;
      break;
  }
  return word;
}

export function getActionPhrase(action) {
  let word;
  switch (action) {
    case BUY_USD:
      word = BUY_USD_WORD;
      break;
    case BUY_EUR:
      word = BUY_EUR_WORD;
      break;
    case SELL_USD:
      word = SELL_USD_WORD;
      break;
    case SELL_EUR:
      word = SELL_EUR_WORD;
      break;
  }
  return word;
}
