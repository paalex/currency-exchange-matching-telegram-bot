import _ from 'lodash';
import {storeUser} from "./firebaseHelper";
import {
  BUY_USD, BUY_EUR, SELL_USD, SELL_EUR, MAIN_MENU
} from '../constants/appEnums';
import {formatRate} from "./currencyHelper"
import {getCityWord} from "./textHelper"
import {telegram} from "../services/telegramService"

function isTransactionType(p) {
  return p === BUY_USD || p === BUY_EUR || p === SELL_USD || p === SELL_EUR
}

function processTelegramUser(user) {
  return {
    id: user.id,
    isBot: user.is_bot || false,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username,
    langCode: user.language_code || ''
  };
}

const getText = (ctx) => _.get(ctx, 'update.message.text')

export async function saveUser(ctx) {
  const user = _.get(ctx, 'update.message.from') || _.get(ctx, 'update.callback_query.from');
  // console.log('saveUser',user);
  const processedUser = processTelegramUser(user);
  if (!processedUser.isBot && processedUser) {
    return storeUser(processedUser);
  }
}

export function readableOffers(offers, city) {
  return _.reduce(offers, (acc, offer) => {
    const { action, amount, currency, rate } = offer;
    const text = `💰 ${action} ${amount} ${currency} @${formatRate(rate)} 💰` + '\n';
    return acc + text
  }, "")
    + (city ? `\n`+ `в г. ${getCityWord(city)}` : '')
}

export function readableOffer(offer) {
  const { action, amount, currency, rate, city } = offer;
  return `💰 ${action} ${amount} ${currency} @${formatRate(rate)}, ${getCityWord(city)}`;
}

export async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

export async function sendTgMsgByChatId({chatId, message}) {
  await telegram.sendMessage(chatId, message);
}

export const goHome = (ctx) => ctx.scene.enter("welcome")

export const isNotValidCB = (ctx) => {
  const txt = getText(ctx);
  const cb_q = _.get(ctx, 'update.callback_query')
  return !cb_q || cb_q.data === MAIN_MENU || txt === '/start' || txt === '/back';
}

export const isNotValidNumber = ctx => {
  const txt = getText(ctx);
  return !txt || isNaN(txt);
}

export const isCBQ = (ctx) => !!_.get(ctx.update, 'callback_query')
