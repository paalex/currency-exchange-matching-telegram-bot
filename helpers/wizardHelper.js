import Markup from "telegraf/markup";
import WizardScene from "telegraf/scenes/wizard";
import _ from 'lodash';
import {storeOffer, listMyOffers, listPotentialMatches, updateCity, rejectMatch, acceptMatch} from "./firebaseHelper";
import {
  BUY,
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
  GRODNO,
  BOBRUYSK,
  BARANOVICHI,
  MAIN_MENU,
  MAIN_MENU_OPTIONS
} from '../constants/appEnums';
import {
  MINSK_WORD,
  GRODNO_WORD,
  BOBRUYSK_WORD,
  BARANOVICHI_WORD,
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
  asyncForEach,
  goHome, isCBQ,
  isNotValidCB, isNotValidNumber,
  readableOffer,
  readableOffers,
  saveUser,
  sendTgMsgByChatId
} from "./telegramHelper"

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

const citiesMenu = Markup.inlineKeyboard([
  [
    Markup.callbackButton(MINSK_WORD, MINSK),
    Markup.callbackButton(GRODNO_WORD, GRODNO)
  ],
  [
    Markup.callbackButton(BOBRUYSK_WORD, BOBRUYSK),
    Markup.callbackButton(BARANOVICHI_WORD, BARANOVICHI),
  ]
]).extra();

const getUser = (ctx) => {
 return _.get(ctx.update, 'callback_query.from') || _.get(ctx.update, 'message.from');
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
      await saveUser(user).catch(e => console.log('err saving user', e));
      await ctx.reply("Что будем делать? 🐰", generateMainMenu);
    }
    return ctx.scene.leave()
  })

export const mainMenuMiddleware = async (ctx, next) => {
  const choice = _.get(ctx.update, 'message.text')
  console.log('mainMenuMiddleware')
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
      storeOffer(user, offer).catch(e => console.warn('err in storeOffer', e))
      const partnerWord = action === SELL ? 'покупателя' : 'продавца';
      const actionWord = action === SELL ? 'продать' : 'купить';
      await ctx.reply(
        `Итак, вы готовы ${actionWord}:\n`
        + `${amount} ${currency} по курсу ${formatRate(rate)} ${currency}-${BYN} в городе ${cityWord}.\n\n`);
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
    if (!selection || !offerId) {
      await ctx.reply('Сделка уже недоступна', backToMainMenuKeyboard);
      return
    }
    const {matches} = ctx.wizard.state;
    const match = _.find(matches, m => m.offer.id === offerId);
    const user = getUser(ctx);
    if (selection === APPROVE_MATCH) {
      const warning = `⚠️За скупку, продажу или обмен валюты без лицензии или госрегистрации предусмотрена административная ответственность️`;
      const advice = `💡Законный способ через обменный пункт: продавец валюты сдает ее в кассу, а покупатель приобретает сразу после него`;
      const text1 = `Вы подтвердили следующую сделку:\n\n` + readableOffer(match.offer)
        + `\n Контакт: @${_.get(match,'offer.username')} \n\n${warning} \n\n ${advice}`;
      await ctx.reply(text1, backToMainMenuKeyboard);
      const text2 = `🎉 Я нашел для вас сделку:\n` + readableOffer(match.myOffer)
        + `\n Контакт: @${_.get(user, 'username')} \n\n${warning} \n\n ${advice}`
      await ctx.editMessageText('👍🏻', emptyInlineKeyboard);
      acceptMatch({match: match.offer, user}).catch(e => console.log('failed acceptMatch', match ,e))
      sendTgMsgByChatId({chatId: match.offer.userId, message: text2}).catch(e => console.log('failed sendTgMsgByChatId', e))
    } else {
      await ctx.editMessageText('➡️🗑', emptyInlineKeyboard);
      await rejectMatch({match: match.offer, user}).catch(e => console.log('err rejecting a match', e))
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
      citiesMenu
    );
    return ctx.wizard.next();
  },
  async ctx => {
    console.log('chooseCityWizard2')
    if (isNotValidCB(ctx)) return goHome(ctx);
    const city = _.get(ctx.update, 'callback_query.data');
    const userId = _.get(getUser(ctx),'id');
    await updateCity({city, userId})
    await ctx.reply(`Ок, ${getCityWord(city)} 🏡`, backToMainMenuKeyboard)
    return ctx.wizard.next();
  },
  ctx => {
    console.log('chooseCityWizard3')
    goHome(ctx)
  }
)


