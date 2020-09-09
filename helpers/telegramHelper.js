import Telegraf from "telegraf";
import Markup from "telegraf/markup";
import Stage from "telegraf/stage";
import WizardScene from "telegraf/scenes/wizard";
import {storeUser, storeOffer, listMyOffers, listPotentialMatches, updateCity} from "./firebaseHelper";
import LocalSession from "telegraf-session-local";
import _ from 'lodash';
import {
  BUY, SELL, BYN, BUY_USD, BUY_EUR, SELL_USD, SELL_EUR,
  MINSK, GRODNO, BOBRUYSK, BARANOVICHI, LIST_OFFERS, LIST_POTENTIAL_MATCHES, SUBMIT_OFFER, CHOOSE_CITY
} from '../constants/appEnums';
import {MINSK_WORD, GRODNO_WORD, BOBRUYSK_WORD, BARANOVICHI_WORD,
  BUY_USD_WORD, BUY_EUR_WORD, SELL_USD_WORD, SELL_EUR_WORD} from '../constants/localizedStrings'
import {destructTransType} from "./currencyHelper"
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

const generateMainMenu = (city) => Markup.inlineKeyboard([
  [
    Markup.callbackButton(`Зарегестрировать новый обмен`, SUBMIT_OFFER)
  ],
  [
    Markup.callbackButton(`Список моих ставок`, LIST_OFFERS)
  ],
  [
    Markup.callbackButton(`Список возможных сделок`, LIST_POTENTIAL_MATCHES)
  ],
  [
    Markup.callbackButton(`Изменить город (${getCityWord(city) || getCityWord(MINSK)})`, CHOOSE_CITY)
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

const getText = (ctx) => _.get(ctx, 'update.message.text')
const getUser = (ctx) => {
 return _.get(ctx.update, 'callback_query.from') || _.get(ctx.update, 'message.from');
}

const welcomeWizard = new WizardScene(
  "welcome",
  async ctx => {
    console.log('ctx.update',ctx.update)
    const user = await saveUser(ctx);
    ctx.reply("Привет. Что будем делать? 🐰", generateMainMenu(user.city));
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
    }
  })

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
    await ctx.reply(`Ок, ${city}`);
    await ctx.scene.enter('welcome')
  })

const matchingWizard = new WizardScene(
  "matching",
  async ctx => {
    const matches = await listPotentialMatches(getUser(ctx));
    const hasMatches = matches && matches.length > 0;
    const matchesText = readableOffers(matches, getUser(ctx).city || MINSK);
    if (hasMatches) {
      await ctx.reply(matchesText || '');
    } else {
      await ctx.reply('Для вас пока нет подходящих сделок 💰❌');
      return ctx.scene.enter('welcome')
    }
    return ctx.wizard.next()
  },
  async ctx => {
    const choice = _.get(ctx.update, 'callback_query.data');
    console.log(choice)
    return ctx.scene.enter('welcome')
  })

const offerWizard = new WizardScene(
  "offer",
  async ctx => {
    ctx.reply("Что будем делать? 🐰", offersMenu);
    return ctx.wizard.next();
  },
  async ctx => {
    if (!ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      await ctx.scene.enter('welcome')
      return
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
        + `Как только найду вам ${partnerWord}, сообщу 🐰`,
        Markup.inlineKeyboard([
          Markup.callbackButton("Начать новый обмен  ↩️", "back"),
        ]).extra()
      );
      return ctx.scene.leave();
    }
    return ctx.scene.reenter()
  }
);
const stage = new Stage([offerWizard, matchingWizard, welcomeWizard, chooseCityWizard]);

async function saveUser(ctx) {
  const user = _.get(ctx, 'update.message.from') || _.get(ctx, 'update.callback_query.from');
  console.log('saveUser', user)
  const processedUser = processTelegramUser(user);
  if (!processedUser.isBot && processedUser) {
    return storeUser(processedUser).catch(e => console.warn('err in storeUser', e));
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

  bot.help(ctx => ctx.reply("Send me a sticker"));
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
    + (city ? `\n`+ `в г.${getCityWord(city)}` : '')
}
