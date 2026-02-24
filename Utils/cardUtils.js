// // utils/cardUtils.js

// function shuffleArray(array) {
//   for (let i = array.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [array[i], array[j]] = [array[j], array[i]];
//   }
//   return array;
// }

// function generateShuffledDeck(cards, totalCards = 45) {
//   if (!Array.isArray(cards) || cards.length === 0) {
//     throw new Error("Cards array is empty");
//   }

//   let deck = [];

//   // repeat cards until totalCards
//   while (deck.length < totalCards) {
//     deck.push(...cards);
//   }

//   // cut extra cards
//   deck = deck.slice(0, totalCards);

//   // shuffle
//   return shuffleArray(deck);
// }

// module.exports = {
//   generateShuffledDeck
// };


// utils/cardUtils.js

// function shuffleArray(array) {
//   for (let i = array.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [array[i], array[j]] = [array[j], array[i]];
//   }
//   return array;
// }

// /**
//  * @param {Array} allCards - Database se aaye hue saare cards
//  * @param {Number} totalCards - Deck ka size (default 45)
//  */
// function generateShuffledDeck(allCards, totalCards = 45) {
//   if (!Array.isArray(allCards) || allCards.length === 0) {
//     throw new Error("Cards array is empty");
//   }

//   // 1. Sirf specific cards ko filter karein
//   const allowedCardNames = ["ONE", "TWO", "THREE", "SEVEN"];
//   const selectedCards = allCards.filter(card => 
//     allowedCardNames.includes(card.card_name)
//   );

//   // Safety check agar filter ke baad kuch na bache
//   if (selectedCards.length === 0) {
//     throw new Error("No matching cards found for ONE, TWO, THREE, or SEVEN");
//   }

//   let deck = [];

//   // 2. Sirf filtered cards ko repeat karein jab tak totalCards na ho jaye
//   while (deck.length < totalCards) {
//     // Har bar original objects ki copy push karein taaki reference issues na ho
//     deck.push(...selectedCards.map(card => ({ ...card })));
//   }

//   // 3. Extra cards ko cut karein
//   deck = deck.slice(0, totalCards);

//   // 4. Shuffle karke return karein
//   return shuffleArray(deck);
// }

// module.exports = {
//   generateShuffledDeck
// };


/**
 * @param {Array} allCards - Database se aaye hue saare unique cards
 */
function generateShuffledDeck(allCards) {
  if (!Array.isArray(allCards) || allCards.length === 0) {
    throw new Error("Cards array is empty");
  }

  // 1. Image ke sequence ke hisaab se card names ka map
  // Ye wahi order hai jo aapki pehli image mein dikh raha hai
  const sequence = [
    "ELEVEN", "ELEVEN", "ELEVEN", "THREE", "FOUR", "FOUR", "ELEVEN", "TEN", "THREE", "SORRY",
    "TEN", "FIVE", "SEVEN", "SEVEN", "TWELVE", "SORRY", "FOUR", "SEVEN", "THREE", "FOUR",
    "TEN", "SEVEN", "TWELVE", "EIGHT", "SORRY", "FIVE", "FIVE", "ONE", "THREE", "ONE",
    "EIGHT", "EIGHT", "ONE", "FIVE", "SORRY", "ONE", "TWELVE", "TWO", "TEN", "SORRY",
    "EIGHT", "ONE", "TWO", "TWO", "TWO"
  ];
  //   const sequence = [
  //   "ELEVEN", "ELEVEN", "ELEVEN", "THREE", "FOUR", "SEVEN", "ELEVEN", "SEVEN", "THREE", "SEVEN",
  //   "TEN", "SEVEN", "SEVEN", "SEVEN", "TWELVE", "SORRY", "FOUR", "SEVEN", "THREE", "FOUR",
  //   "TEN", "SEVEN", "TWELVE", "EIGHT", "SORRY", "FIVE", "FIVE", "ONE", "THREE", "ONE",
  //   "EIGHT", "EIGHT", "ONE", "FIVE", "SORRY", "ONE", "TWELVE", "TWO", "TEN", "SORRY",
  //   "EIGHT", "ONE", "TWO", "TWO", "TWO"
  // ];

  // 2. Database cards ko ek lookup object mein convert karein for fast access
  const cardLookup = {};
  allCards.forEach(card => {
    cardLookup[card.card_name] = card;
  });

  // 3. Sequence ke hisaab se deck generate karein (No Shuffle)
  const finalDeck = sequence.map((name, index) => {
    const cardData = cardLookup[name];
    if (!cardData) {
      throw new Error(`Card ${name} not found in database cards`);
    }
    // Har card ki copy return karein with a unique ID or Index if needed
    return { 
      ...cardData, 
    };
  });

  return finalDeck;
}

module.exports = {
  generateShuffledDeck
};