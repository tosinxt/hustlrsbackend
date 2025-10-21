import twilio from 'twilio';

// Check if Twilio credentials are available
const hasTwilioCredentials = process.env.TWILIO_ACCOUNT_SID && 
                           process.env.TWILIO_AUTH_TOKEN && 
                           process.env.TWILIO_PHONE_NUMBER;

// Log Twilio status
console.log('📱 Twilio Status:', hasTwilioCredentials ? '✅ Credentials found' : '❌ Missing credentials - using development mode');

let client;
if (hasTwilioCredentials) {
  try {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('🔌 Twilio client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Twilio client:', error.message);
  }
}

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
    
    // In development mode without Twilio, log the code to console
    if (!hasTwilioCredentials) {
      console.log('📲 [DEVELOPMENT MODE] Verification code:', {
        phoneNumber,
        code,
        message: 'In production, this would be sent via SMS'
      });
      
      // Store the code with a 10-minute expiration
      verificationCodes.set(phoneNumber, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
      });
      
      return { 
        success: true, 
        message: 'Verification code generated (development mode)',
        code // Return code for development purposes
      };
    }

    // In production or with Twilio credentials, send actual SMS
    console.log('📤 Sending SMS to:', phoneNumber);
    console.log('📝 Message:', message);
    
    const smsResponse = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    
    console.log('✅ SMS sent successfully:', smsResponse.sid);

    // Store the code with a 10-minute expiration
    verificationCodes.set(phoneNumber, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return { 
      success: true, 
      message: 'Verification code sent',
      sid: smsResponse.sid
    };
  } catch (error) {
    console.error('❌ Error sending verification code:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
      stack: error.stack
    });
    
    // If Twilio credentials are invalid or missing
    if (error.code === 20003) { // Invalid Twilio credentials
      console.error('❌ Twilio authentication failed. Please check your credentials.');
      return { 
        success: false, 
        message: 'SMS service configuration error',
        error: 'Invalid SMS service credentials',
        requiresAdmin: true
      };
    }
    
    return { 
      success: false, 
      message: 'Failed to send verification code. Please try again.',
      error: error.message,
      code: error.code
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
