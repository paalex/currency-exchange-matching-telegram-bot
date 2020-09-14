import Markup from "telegraf/markup";
import WizardScene from "telegraf/scenes/wizard";
import _ from 'lodash';
import {config as dotenv_config} from "dotenv"
import {storeOffer, listMyOffers, listPotentialMatches, updateCity, rejectMatch, acceptMatch} from "./firebaseHelper";
import {
  SELL,
  BYN,
  BUY_USD,
  BUY_EUR,
  SELL_USD,
  SELL_EUR,
  REJECT_MATCH,
  APPROVE_MATCH,
  USD,
  EUR,
  MINSK,
  MAIN_MENU,
  MAIN_MENU_OPTIONS, CITIES_DICT, SUGGEST_NEW_CITY
} from '../constants/appEnums';
import {
  BUY_USD_WORD,
  BUY_EUR_WORD,
  SELL_USD_WORD,
  SELL_EUR_WORD,
  GET_NBRB_EUR_WORD,
  GET_NBRB_USD_WORD,
  CHOOSE_CITY_WORD,
  LIST_POTENTIAL_MATCHES_WORD, LIST_OFFERS_WORD, SUBMIT_OFFER_WORD
} from '../constants/localizedStrings'
import {destructTransType, fetchNBRBRatesUSD, fetchNBRBRatesEUR, formatRate} from "./currencyHelper"
import {getCityWord, getActionPhrase} from "./textHelper"
import {
  asyncForEach, getText,
  goHome, isCBQ,
  isNotValidCB, isNotValidNumber,
  readableOffer,
  readableOffers,
  saveUser, sendTgMsgByChannelName,
  sendTgMsgByChatId
} from "./telegramHelper"

dotenv_config()
const {NEWS_TELEGRAM_CHANNEL, ADMIN_GROUP_ID} = process.env;

const generateMainMenu = Markup.keyboard([
  [Markup.callbackButton(SUBMIT_OFFER_WORD)],
  [Markup.callbackButton(LIST_OFFERS_WORD)],
  [Markup.callbackButton(LIST_POTENTIAL_MATCHES_WORD)],
  [Markup.callbackButton(CHOOSE_CITY_WORD)], //(${getCityWord(city) || getCityWord(MINSK)})
  [
    Markup.callbackButton(GET_NBRB_USD_WORD),
    Markup.callbackButton(GET_NBRB_EUR_WORD)
  ]
]).oneTime().extra();
const backToMainMenuButton = Markup.callbackButton("Открыть меню ⬆️️", MAIN_MENU)
const backToMainMenuKeyboard = Markup.inlineKeyboard([backToMainMenuButton]).extra()

const offersMenu = Markup.inlineKeyboard([
  [
    Markup.callbackButton(`${BUY_USD_WORD} $`, BUY_USD),
    Markup.callbackButton(`${BUY_EUR_WORD} €`, BUY_EUR)
  ],
  [
    Markup.callbackButton(`${SELL_USD_WORD} $`, SELL_USD),
    Markup.callbackButton(`${SELL_EUR_WORD} €`, SELL_EUR)
  ]
]).extra();

const removeKeyboardMarkup = Markup.removeKeyboard().extra();
const emptyInlineKeyboard =  Markup.inlineKeyboard([ Markup.callbackButton(`dummy`, 'dummy', true) ]).extra();

const generateMatchKeyboard = ({match, withBack}) => {
  const buttons = [[
    Markup.callbackButton(`✅`, JSON.stringify({selection: APPROVE_MATCH, offerId: match.id})),
    Markup.callbackButton(`❌`, JSON.stringify({selection: REJECT_MATCH, offerId: match.id}))
    ]]
  if (withBack) buttons.push([backToMainMenuButton])
  return Markup.inlineKeyboard(buttons).extra();
}

const citiesBtnDict = _.chunk(_.map(CITIES_DICT, c => Markup.callbackButton(c.word, c.value)),3)
const addCityButton = Markup.callbackButton('Добавить мой город', SUGGEST_NEW_CITY)
const citiesMenu = Markup.inlineKeyboard(citiesBtnDict).extra();
const citiesWithAddCityMenu = Markup.inlineKeyboard(_.concat(citiesBtnDict,[[addCityButton]])).extra();

const getUser = (ctx) => {
 return _.get(ctx.update, 'callback_query.from') || _.get(ctx.update, 'message.from');
}

const getTimestamp = (ctx) => {
 return _.get(ctx.update, 'callback_query.message.date') || _.get(ctx.update, 'message.date') || 0;
}

export const mainMenuMiddleware = async (ctx, next) => {
  const choice = _.get(ctx.update, 'message.text')
  if (_.some(_.map(MAIN_MENU_OPTIONS), m => m === choice)) {
    // is menu click
    const userId = _.get(getUser(ctx),'id');
    switch (choice) {
      case LIST_OFFERS_WORD:
        let offers;
        if (userId) {
          offers = await listMyOffers(userId).catch(e => console.log('listMyOffers', e));
          const offersText = offers && offers.length > 0
            ? readableOffers(offers, getUser(ctx).city || MINSK)
            : "У вас нет открытых сделок 💰❌. \nВыберите 'Начать новый обмен' в меню"
          await ctx.reply(`📝 Список ваших открытых сделок: \n${offersText || ''}`, backToMainMenuKeyboard)
        }
        return ctx.scene.leave()
      case LIST_POTENTIAL_MATCHES_WORD:
        return ctx.scene.enter('matching')
      case SUBMIT_OFFER_WORD:
        return ctx.scene.enter('offer')
      case CHOOSE_CITY_WORD:
        return ctx.scene.enter('choose_city')
      case GET_NBRB_USD_WORD: // fall through.  same as ||
      case GET_NBRB_EUR_WORD:
        const currency = choice === GET_NBRB_USD_WORD ? USD : EUR;
        let rate;
        if (currency === USD) {
          rate = await fetchNBRBRatesUSD().catch(e => console.log('err fetchNBRBRatesUSD', e.code));
        } else if (currency === EUR) {
          rate = await fetchNBRBRatesEUR().catch(e => console.log('err fetchNBRBRatesEUR', e));
        }
        const unavailableText = 'НБРБ не доступен';
        const text = rate ? `${formatRate(rate)} ${currency}-BYN` : unavailableText
        ctx.reply(text, backToMainMenuKeyboard)
        return ctx.scene.leave();
      default:
        return ctx.scene.leave()
    }
  } else if (choice === MAIN_MENU) {
    console.log("MAIN_MENU")
    ctx.scene.enter('welcome')
  }
  return next()
}

export const welcomeWizard = new WizardScene(
  "welcome",
  async ctx => {
    console.log('welcomeWizard1')
    const user = getUser(ctx);
    if (!user.username) {
      await ctx.reply("В вашем профиле телеграма не хватает имени пользователя. Имя пользователя можно легко " +
        "добавить в 'Настройки' => 'Имя пользователя'. Без имени пользователя я не смогу соединить вас с другими пользователями чтобы осуществить обмены")
    } else {
      const timestamp = getTimestamp(ctx);
      await saveUser({user, lastUsed: timestamp}).catch(e => console.log('err saving user', e));
      await ctx.reply("Что будем делать? 🐰", generateMainMenu);
    }
    return ctx.scene.leave()
  })

export const offerWizard = new WizardScene(
  'offer',
  async ctx => {
    console.log('offerWizard1')
    ctx.reply("Что будем делать? 🐰", offersMenu);
    return ctx.wizard.next();
  },
  async ctx => {
    console.log('offerWizard2')
    if (isNotValidCB(ctx)) return goHome(ctx);
    const choice = _.get(ctx.update, 'callback_query.data');
    if (choice) {
      const {currency, action} = destructTransType(choice)
      ctx.wizard.state.currency = currency;
      ctx.wizard.state.action = action;
      if (currency) {
        let phrase = getActionPhrase(choice);
        if (phrase) {
          ctx.reply(
            `Понятно, ${phrase}. Сколько ${currency}?`
          );
          return ctx.wizard.next();
        }
      }
    }
    return goHome(ctx)
  },
  async ctx => {
    console.log('offerWizard3')
    if (isCBQ(ctx)) return goHome(ctx);
    if (isNotValidNumber(ctx)) {
      ctx.reply('Введите корректную сумму. Например 150')
      return
    }
    ctx.wizard.state.amount = ctx.message.text;
    const {amount, currency} = ctx.wizard.state;
    ctx.reply(
      `🐰 Ок. ${amount} ${currency}. По какому курсу? (Сколько рублей вы просите за один ${currency})`
    );
    return ctx.wizard.next();
  },
  async ctx => {
    console.log('offerWizard4')
    if (isCBQ(ctx)) return goHome(ctx);
    if (isNotValidNumber(ctx)) {
      ctx.reply('Введите корректный курс. Например 3.41 ')
      return
    }
    ctx.wizard.state.rate = ctx.message.text;
    const {currency, rate} = ctx.wizard.state;
    ctx.reply(
      `Понятно. ${formatRate(rate)} ${currency}-${BYN}.\n`
      + `В каком городе вы можете встретится?`,
      citiesMenu
    );
    return ctx.wizard.next();
  },
  async ctx => {
    console.log('offerWizard5')
    if (isNotValidCB(ctx)) return goHome(ctx);
    ctx.wizard.state.city = ctx.update.callback_query.data;
    const {currency, rate, amount, action, city} = ctx.wizard.state;
    updateCity({city, userId: getUser(ctx).id}).catch(e => console.log('error setting city', e));
    const offer = ctx.wizard.state;
    const user = ctx.update.callback_query.from;
    const cityWord = getCityWord(city);
    const invalid = !amount || !currency || !rate || !cityWord;
    if (!invalid) {
      const timestamp = getTimestamp(ctx);
      storeOffer({user, offer, createdAt: timestamp}).catch(e => console.warn('err in storeOffer', e))
      const partnerWord = action === SELL ? 'покупателя' : 'продавца';
      const actionWord = action === SELL ? 'продать' : 'купить';
      await ctx.reply(
        `Итак, вы готовы ${actionWord}:\n`
        + `${amount} ${currency} по курсу ${formatRate(rate)} ${currency}-${BYN} в городе ${cityWord}.\n\n`);
      const channelText = `💰 "Готов ${actionWord} ${amount} ${currency} по курсу ${formatRate(rate)} ${currency}-${BYN} в г. ${cityWord}"`
      await sendTgMsgByChannelName({name: NEWS_TELEGRAM_CHANNEL, message: channelText}).catch(e => console.log('failed sendTgMsgByChannelName', e))
      return ctx.scene.enter("matching");
    }
    ctx.reply(`Что-то не так, давай начнем с начало`)
    return ctx.scene.reenter()
  },
  ctx => {
    console.log('offerWizard6')
    goHome(ctx)
  }
);

export const matchingWizard = new WizardScene(
  "matching",
  async ctx => {
    console.log('matchingWizard1')
    await ctx.reply(`🔍...`);
    const {matches} = await listPotentialMatches(getUser(ctx).id).catch(e => {
      console.log('err in listPotentialMatches', e)
      return goHome(ctx)
    });
    ctx.wizard.state.matches = matches;
    const hasMatches = matches && matches.length > 0;
    if (hasMatches) {
      const matchesToDisplay = matches.length <= 5 ? matches : _.slice(matches,0,5);
      await ctx.reply(`🤝 Список возможных сделок:`);
      await asyncForEach(matchesToDisplay, async (match, idx, arr) => {
        await ctx.reply(`${readableOffer(match.offer) || 'Уже недоступен'}`,
          generateMatchKeyboard({match: match.offer, withBack: idx === arr.length - 1}))
      });
    } else {
      await ctx.reply('Для вас пока нет подходящих сделок 💰❌ \nКак только найду, сообщу 🐰', backToMainMenuKeyboard);
      return ctx.scene.leave()
    }
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('matchingWizard2')
    if (isNotValidCB(ctx)) return goHome(ctx);
    const choice = _.get(ctx.update, 'callback_query.data');
    let selection, offerId;
    try {
      const res = JSON.parse(choice) || {};
      selection = res.selection;
      offerId = res.offerId;
    } catch (e) {
      console.log('err parsing JSON in matchingWizard1')
      return goHome(ctx)
    }

    const {matches} = ctx.wizard.state;
    const match = _.find(matches, m => m.offer.id === offerId);
    if (!selection || !offerId || !match) {
      ctx.editMessageText('➡️🗑', emptyInlineKeyboard).catch(e => console.log('matchingWizard2 editMessageText', e));
      ctx.reply('Сделка уже недоступна', backToMainMenuKeyboard).catch(e => console.log('matchingWizard2 reply', e));
      return
    }
    const {offer, myOffer} = match; // his offer
    const {city, rate, userId, username, amount, currency} = offer; // his offer
    const user = getUser(ctx);
    const timestamp = getTimestamp(ctx);
    if (selection === APPROVE_MATCH) {
      const warning = `⚠️ За скупку, продажу или обмен валюты без лицензии или госрегистрации предусмотрена административная ответственность️`;
      const advice = `💡Законный способ через обменный пункт: продавец валюты сдает ее в кассу, а покупатель приобретает сразу после него`;
      const text1 = `Вы подтвердили следующую сделку:\n\n` + readableOffer(offer)
        + `\n Контакт: @${username} \n\n${warning} \n\n ${advice}`;
      await ctx.reply(text1, backToMainMenuKeyboard);
      const text2 = `🎉 Я нашел для вас сделку:\n` + readableOffer(myOffer)
        + `\n Контакт: @${_.get(user, 'username')} \n\n${warning} \n\n ${advice}`
      await ctx.editMessageText('👍🏻', emptyInlineKeyboard);
      acceptMatch({offer, user, timestamp}).catch(e => console.log('failed acceptMatch', match ,e))
      sendTgMsgByChatId({chatId: userId, message: text2}).catch(e => console.log('failed sendTgMsgByChatId', e))
      const cityWord = getCityWord(city);
      const channelText = `💰 "Новая сделка! ${amount} ${currency} по курсу ${formatRate(rate)} ${currency}-${BYN} в г. ${cityWord}"`
      sendTgMsgByChannelName({name: NEWS_TELEGRAM_CHANNEL, message: channelText}).catch(e => console.log('failed sendTgMsgByChannelName', e))
    } else if (selection === REJECT_MATCH) {
      await ctx.editMessageText('➡️🗑', emptyInlineKeyboard);
      rejectMatch({offer, user, timestamp}).catch(e => console.log('err rejecting a match', e))
    }
  },
  ctx => {
    console.log('matchingWizard3')
    return goHome(ctx)
  }
)

export const chooseCityWizard = new WizardScene(
  "choose_city",
  ctx => {
    console.log('chooseCityWizard1')
    // console.log('ctx',ctx)
    ctx.reply(`В каком городе вы можете встретится?`,
      citiesWithAddCityMenu
    );
    return ctx.wizard.next();
  },
  async ctx => {
    console.log('chooseCityWizard2')
    if (isNotValidCB(ctx)) return goHome(ctx);
    const city = _.get(ctx.update, 'callback_query.data');
    if (city === SUGGEST_NEW_CITY) {
      ctx.wizard.state.SUGGEST_NEW_CITY = true;
      await ctx.reply(`Как называется ваш город? 🏘`)
    } else {
      const userId = _.get(getUser(ctx), 'id');
      await updateCity({city, userId})
      await ctx.reply(`Ок, ${getCityWord(city)} 🏡`, backToMainMenuKeyboard)
    }
    return ctx.wizard.next();
  },
  async ctx => {
    const city = getText(ctx);
    console.log('shouldAddNewCity',ctx)
    console.log('city',city)
    const shouldAddNewCity = _.get(ctx.wizard, `state.${SUGGEST_NEW_CITY}`);
    console.log('shouldAddNewCity',ctx.wizard.state)

    if (shouldAddNewCity) {
      if (city) {
        await ctx.reply(`Я попытаюсь зарегистрировать ваш город. Это обычно занимает несколько часов ⏳`)
        sendTgMsgByChatId({
          chatId: ADMIN_GROUP_ID,
          message: `Please add the following new city: ${city}`
        }).catch(e => console.log(`err submitting new city - ${city}`, e))
      } else {
        await ctx.reply(`Что-то не так, давай попробуем опять`)
        return ctx.scene.enter('choose_city')
      }
    }
    console.log('chooseCityWizard3')
    goHome(ctx)
  }
)


