/**
 * ASK GEMINI - FEEDBACK SYSTEM AUTOMATOR
 * 
 * Instructions:
 * 1. Go to script.google.com
 * 2. Paste this code and click "Run"
 * 3. Copy the URL printed in the console and put it in your content.js
 */

function setupFeedbackSystem() {
  // 1. Create the Form
  var form = FormApp.create('Ask Gemini - User Feedback')
      .setTitle('Help us improve Ask Gemini')
      .setDescription('We noticed you weren\'t enjoying the extension. Please let us know how we can make it better for you.')
      .setConfirmationMessage('Thanks for your feedback! We will use this to improve the next version.');

  // 2. Add Questions
  form.addMultipleChoiceItem()
      .setTitle('How would you rate your overall experience?')
      .setChoiceValues(['Frustrating', 'Confusing', 'Missing Features', 'Too Slow', 'Other'])
      .setRequired(true);

  form.addParagraphTextItem()
      .setTitle('What specifically can we do better?')
      .setRequired(true);

  form.addTextItem()
      .setTitle('Email (Optional - if you want a reply)')
      .setHelpText('We only use this to follow up on your specific feedback.');

  // 3. Set up Email Notifications
  var email = Session.getActiveUser().getEmail();
  ScriptApp.newTrigger('onFormSubmit')
      .forForm(form)
      .onFormSubmit()
      .create();

  Logger.log('🚀 SUCCESS!');
  Logger.log('1. FORM EDIT URL: ' + form.getEditUrl());
  Logger.log('2. PUBLIC URL (Put this in content.js): ' + form.getPublishedUrl());
}

/**
 * Sends you an email every time a user submits the form
 */
function onFormSubmit(e) {
  var itemResponses = e.response.getItemResponses();
  var message = 'New Ask Gemini Feedback Received:\n\n';
  
  for (var i = 0; i < itemResponses.length; i++) {
    message += itemResponses[i].getItemHeader() + ': ' + itemResponses[i].getResponse() + '\n';
  }
  
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: '🚨 New Ask Gemini Feedback',
    body: message
  });
}
