import {GET_NBRB_USD_WORD, GET_NBRB_EUR_WORD, CHOOSE_CITY_WORD, LIST_OFFERS_WORD,
  LIST_POTENTIAL_MATCHES_WORD, SUBMIT_OFFER_WORD} from "./localizedStrings"

export const BUY = "BUY";
export const SELL = "SELL";
export const USD = "USD";
export const EUR = "EUR";
export const BYN = "BYN";
export const BUY_USD = `${BUY}_${USD}`;
export const BUY_EUR = `${BUY}_${EUR}`;
export const SELL_USD = `${SELL}_${USD}`;
export const SELL_EUR = `${SELL}_${EUR}`;
export const MINSK = "MINSK";
export const GRODNO = "GRODNO";
export const BOBRUYSK = "BOBRUYSK";
export const BARANOVICHI = "BARANOVICHI";

export const REJECT_MATCH = 'REJECT_MATCH';
export const APPROVE_MATCH = 'APPROVE_MATCH';

export const LIST_OFFERS = LIST_OFFERS_WORD;
export const SUBMIT_OFFER = SUBMIT_OFFER_WORD;
export const LIST_POTENTIAL_MATCHES = LIST_POTENTIAL_MATCHES_WORD;
export const CHOOSE_CITY = CHOOSE_CITY_WORD;
export const GET_NBRB_USD = GET_NBRB_USD_WORD;
export const GET_NBRB_EUR = GET_NBRB_EUR_WORD;

export const MAIN_MENU = 'MAIN_MENU';

export const MAIN_MENU_OPTIONS = {
  [SUBMIT_OFFER]: SUBMIT_OFFER,
  [LIST_OFFERS]: LIST_OFFERS,
  [LIST_POTENTIAL_MATCHES]: LIST_POTENTIAL_MATCHES,
  [CHOOSE_CITY]: CHOOSE_CITY,
  [GET_NBRB_USD]: GET_NBRB_USD,
  [GET_NBRB_EUR]: GET_NBRB_EUR
}
