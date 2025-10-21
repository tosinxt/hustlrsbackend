import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// Store verification codes in memory (in production, use Redis or database)
const verificationCodes = new Map();

/**
 * Send verification code to phone number
 * @param {string} phoneNumber - The phone number to send the code to
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendVerificationCode = async (phoneNumber) => {
  try {
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const message = `Your Hustlrs verification code is: ${code}`;

    // Send SMS
    await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber
    });

    // Store the code with a 10-minute expiration
    verificationCodes.set(phoneNumber, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return { success: true, message: 'Verification code sent' };
  } catch (error) {
    console.error('Error sending verification code:', error);
    return { 
      success: false, 
      message: 'Failed to send verification code',
      error: error.message 
    };
  }
};

/**
 * Verify the code entered by the user
 * @param {string} phoneNumber - The phone number to verify
 * @param {string} code - The code to verify
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const verifyCode = (phoneNumber, code) => {
  const storedCode = verificationCodes.get(phoneNumber);
  
  if (!storedCode) {
    return { success: false, message: 'No verification code found for this number' };
  }

  if (Date.now() > storedCode.expiresAt) {
    verificationCodes.delete(phoneNumber);
    return { success: false, message: 'Verification code has expired' };
  }

  if (storedCode.code !== code) {
    return { success: false, message: 'Invalid verification code' };
  }

  // Code is valid, remove it from storage
  verificationCodes.delete(phoneNumber);
  return { success: true, message: 'Phone number verified' };
};

export default {
  sendVerificationCode,
  verifyCode
};
