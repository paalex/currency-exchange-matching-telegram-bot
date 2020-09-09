import Telegraf from "telegraf";
import Markup from "telegraf/markup";
import Stage from "telegraf/stage";
import WizardScene from "telegraf/scenes/wizard";
import LocalSession from "telegraf-session-local";
import _ from 'lodash';
import {storeUser, storeOffer, listMyOffers, listPotentialMatches, updateCity} from "./firebaseHelper";
import {
  BUY, SELL, BYN, BUY_USD, BUY_EUR, SELL_USD, SELL_EUR, REJECT_MATCH, APPROVE_MATCH, GET_NBRB, USD, EUR,
  MINSK, GRODNO, BOBRUYSK, BARANOVICHI, LIST_OFFERS, LIST_POTENTIAL_MATCHES, SUBMIT_OFFER, CHOOSE_CITY, MAIN_MENU
} from '../constants/appEnums';
import {MINSK_WORD, GRODNO_WORD, BOBRUYSK_WORD, BARANOVICHI_WORD,
  BUY_USD_WORD, BUY_EUR_WORD, SELL_USD_WORD, SELL_EUR_WORD} from '../constants/localizedStrings'
import {destructTransType, fetchNBRBRates} from "./currencyHelper"
import {getCityWord, getActionPhrase} from "./textHelper"

const {SERVER_URL, TELEGRAM_API_KEY} = process.env;
const bot = new Telegraf(TELEGRAM_API_KEY);

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

const generateMatchButtons = (match) => Markup.inlineKeyboard([
  Markup.callbackButton(`✅`, JSON.stringify({selection: APPROVE_MATCH, offerId: match.id})),
  Markup.callbackButton(`❌`, JSON.stringify({selection: REJECT_MATCH, offerId: match.id}))
]).extra();

const generateMainMenu = (city) => Markup.inlineKeyboard([
  [
    Markup.callbackButton(`🖐🏻 Зарегестрировать новый обмен`, SUBMIT_OFFER)
  ],
  [
    Markup.callbackButton(`📝 Список моих ставок`, LIST_OFFERS)
  ],
  [
    Markup.callbackButton(`🤝 Список возможных обменов`, LIST_POTENTIAL_MATCHES)
  ],
  [
    Markup.callbackButton(`🏠 Выбрать/изменить город`, CHOOSE_CITY) //(${getCityWord(city) || getCityWord(MINSK)})
  ],
  [
    Markup.callbackButton(`🏛 Курс НБРБ сегодня`, GET_NBRB) //(${getCityWord(city) || getCityWord(MINSK)})
  ]
]).extra();

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

const citiesButtons = Markup.inlineKeyboard([
  [
    Markup.callbackButton(MINSK_WORD, MINSK),
    Markup.callbackButton(GRODNO_WORD, GRODNO)
  ],
  [
    Markup.callbackButton(BOBRUYSK_WORD, BOBRUYSK),
    Markup.callbackButton(BARANOVICHI_WORD, BARANOVICHI),
  ]
]).extra();

const backToMainMenuButton = Markup.inlineKeyboard([
  Markup.callbackButton("Главное меню ↩️", MAIN_MENU),
]).extra()

const getText = (ctx) => _.get(ctx, 'update.message.text')
const getUser = (ctx) => {
 return _.get(ctx.update, 'callback_query.from') || _.get(ctx.update, 'message.from');
}

const welcomeWizard = new WizardScene(
  "welcome",
  async ctx => {
    saveUser(ctx).catch(e => console.log('err saving user', e));
    ctx.reply("Привет. Что будем делать? 🐰", generateMainMenu());
    return ctx.wizard.next();
  },
  async ctx => {
    const choice = _.get(ctx.update, 'callback_query.data');
    const userId = _.get(getUser(ctx),'id');
    if (choice === LIST_OFFERS) {
      let offers;
      if (userId) {
        offers = await listMyOffers(userId).catch(e => console.log('listMyOffers', e));
        const offersText = offers && offers.length > 0 ? readableOffers(offers, getUser(ctx).city || MINSK) : 'У вас нет ставок 💰'
        await ctx.reply(offersText || '');
      }
      return ctx.scene.reenter()
    } else if (choice === LIST_POTENTIAL_MATCHES) {
      await ctx.scene.enter('matching')
    } else if (choice === SUBMIT_OFFER) {
      await ctx.scene.enter('offer')
    } else if (choice === CHOOSE_CITY) {
      await ctx.scene.enter('choose_city')
    } else if (choice === GET_NBRB) {
      const unavailableText = 'НБРБ не доступен';
      const {USD: usdRate, EUR: eurRate} = await fetchNBRBRates().catch(e => {
        console.log('err fetchNBRBRates', e);
        ctx.reply(unavailableText, backToMainMenuButton)
      });
      const text = usdRate || eurRate
        ? `${usdRate} ${USD}-BYN \n` + `${eurRate} ${EUR}-BYN`
        : unavailableText
      ctx.reply(text, backToMainMenuButton)
    }
  },
  ctx => ctx.scene.reenter()
  )

const chooseCityWizard = new WizardScene(
  "choose_city",
  ctx => {
    // console.log('ctx',ctx)
    ctx.reply(`В каком городе вы можете встретится?`,
      citiesButtons
    );
    return ctx.wizard.next();
  },
  async ctx => {
    const city = _.get(ctx.update, 'callback_query.data');
    const userId = _.get(getUser(ctx),'id');
    await updateCity({city, userId})
    await ctx.reply(`Ок, ${city}`, backToMainMenuButton)
    return ctx.wizard.next();
  },
  ctx => ctx.scene.enter('welcome')
)

const matchingWizard = new WizardScene(
  "matching",
  async ctx => {
    const {matches, city} = await listPotentialMatches(getUser(ctx).id);
    ctx.wizard.state.matches = matches;
    const hasMatches = matches && matches.length > 0;
    if (hasMatches) {
      const matchesToDisplay = matches.length <= 5 ? matches : _.slice(matches,0,5);
      await asyncForEach(matchesToDisplay,
        async match => await ctx.reply(readableOffer(match) || '', generateMatchButtons(match)));
      ctx.reply(`в г. ${getCityWord(city)}`);
    } else {
      await ctx.reply('Для вас пока нет подходящих сделок 💰❌');
      return ctx.scene.enter('welcome')
    }
    return ctx.wizard.next()
  },
  async ctx => {
    if (!ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      return ctx.scene.enter('welcome')
    }
    const choice = _.get(ctx.update, 'callback_query.data');
    if (choice) {
      const {selection, offerId} = JSON.parse(choice) || {};
      if (selection === APPROVE_MATCH) {
        const {matches} = ctx.wizard.state;
        const match = _.find(matches, m => m.id === offerId);
        await ctx.reply(`Вы подтвердили следующую сделку:\n`+ readableOffer(match) + `Контакт: ${match.username}`);
      }
    }
  })

const offerWizard = new WizardScene(
  "offer",
  async ctx => {
    ctx.reply("Что будем делать? 🐰", offersMenu);
    return ctx.wizard.next();
  },
  async ctx => {
    if (!ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      return ctx.scene.enter('welcome')
    }
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
  },
  async ctx => {
    if (ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      await ctx.scene.enter('welcome')
      return
    }
    ctx.wizard.state.amount = ctx.message.text;
    const {amount, currency} = ctx.wizard.state;
    ctx.reply(
      `🐰 Ок. ${amount} ${currency}. По какому курсу?`
    );
    return ctx.wizard.next();
  },
  async ctx => {
    if (ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      await ctx.scene.enter('welcome')
      return
    }
    ctx.wizard.state.rate = ctx.message.text;
    const {currency} = ctx.wizard.state;
    ctx.reply(
      `Понятно. ${ctx.wizard.state.rate} ${currency}-${BYN}.\n`
      + `В каком городе вы можете встретится?`,
      citiesButtons
    );
    return ctx.wizard.next();
  },
  async ctx => {
    if (!ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      await ctx.scene.enter('welcome')
      return
    }
    ctx.wizard.state.city = ctx.update.callback_query.data;
    const {currency, rate, amount, action, city} = ctx.wizard.state;
    console.log("ctx.wizard.state", ctx.wizard.state)
    const offer = ctx.wizard.state;
    const user = ctx.update.callback_query.from;
    const cityWord = getCityWord(city);
    const invalid = !amount || !currency || !rate || !cityWord;
    if (!invalid) {
      storeOffer(user, offer).catch(e => console.warn('err in storeOffer', e))
      const partnerWord = action === SELL ? 'покупателя' : 'продавца';
      const actionWord = action === SELL ? 'продать' : 'купить';
      ctx.reply(
        `Итак, вы готовы ${actionWord}:\n`
        + `${amount} ${currency} по курсу ${rate} ${currency}-${BYN} в городе ${cityWord}.\n\n`
        + `Как только найду вам ${partnerWord}, сообщу 🐰`, backToMainMenuButton);
      return ctx.wizard.next();
    }
    ctx.reply(`Что-то не так, давай начнем с начало`)
    ctx.scene.reenter()
  },
  ctx => {
    ctx.scene.enter('welcome')
  }
);
const stage = new Stage([offerWizard, matchingWizard, welcomeWizard, chooseCityWizard]);

async function saveUser(ctx) {
  const user = _.get(ctx, 'update.message.from') || _.get(ctx, 'update.callback_query.from');
  const processedUser = processTelegramUser(user);
  if (!processedUser.isBot && processedUser) {
    return storeUser(processedUser);
  }
}

export function botInit(expressApp) {
  bot.telegram.setWebhook(`${SERVER_URL}/bot${TELEGRAM_API_KEY}`).catch(e => console.warn('telegram.setWebhook err', e));
  expressApp.use(bot.webhookCallback(`/bot${TELEGRAM_API_KEY}`));
  // Scene registration
  bot.use((new LocalSession({database: '.data/telegraf_db.json'})).middleware())
  // bot.use(session());
  bot.use(stage.middleware());
  bot.start(async ctx => {
    ctx.scene.enter("welcome");
  });
  bot.action("back", async ctx => {
    await ctx.scene.reenter().catch(e => {
      console.warn('back reenter err', e)
      ctx.scene.enter("offer").catch(e => {
        console.warn('back enter err', e)
      });
    });
  });

//   bot.on("callback_query", ctx => {
//     const cbQuery = ctx.update.callback_query;
//     console.log(cbQuery);
//     const action = cbQuery.data;
//     const msg = cbQuery.message;
//     const opts = {
//       chat_id: msg.chat.id,
//       message_id: msg.message_id
//     };
//     let text;

  // bot.help(ctx => ctx.reply("Send me a sticker"));
  bot.on("sticker", ctx => ctx.reply("👍"));
  bot.hears("hi", ctx => ctx.reply("Hey there"));
  /*
   your bot commands and all the other stuff on here ....
  */
  // bot.launch();
  // bot.telegram.setWebhook(`${HEROKU_URL}${TELEGRAM_API_KEY}`)
  // // Http webhook, for nginx/heroku users.
  // bot.startWebhook(`/${TELEGRAM_API_KEY}`, null, PORT)
}

export function readableOffers(offers, city) {
  return _.reduce(offers, (acc, offer) => {
    const { action, amount, currency, rate } = offer;
    const text = `💰 ${action} ${amount} ${currency} @${rate} 💰` + '\n';
    return acc + text
  }, "")
    + (city ? `\n`+ `в г. ${getCityWord(city)}` : '')
}

export function readableOffer(offer) {
  const { action, amount, currency, rate } = offer;
  return `💰 ${action} ${amount} ${currency} @${rate} 💰` + '\n';
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}
