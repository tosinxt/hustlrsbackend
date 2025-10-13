const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000'; // Update with your backend URL

const testTasks = [
  {
    title: 'Grocery Shopping at Shoprite',
    description: 'Need someone to help me shop for groceries at Shoprite. I will provide a detailed list.',
    category: 'SHOPPING',
    budget: 250000, // ₦2,500 in kobo
    priority: 'NORMAL',
    address: '123 Main Street, Lekki',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Deep Cleaning 3-Bedroom Apartment',
    description: 'Looking for a professional cleaner to deep clean my 3-bedroom apartment. Includes kitchen, bathrooms, and living areas.',
    category: 'CLEANING',
    budget: 800000, // ₦8,000 in kobo
    priority: 'HIGH',
    address: '45 Victoria Island Road',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Haircut and Styling',
    description: 'Need a barber to come to my location for a haircut and beard trim.',
    category: 'BARBING',
    budget: 300000, // ₦3,000 in kobo
    priority: 'NORMAL',
    address: '78 Admiralty Way, Lekki Phase 1',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Content Writing for Blog',
    description: 'Need a skilled writer to create 5 blog posts (1000 words each) about technology trends.',
    category: 'WRITING',
    budget: 2500000, // ₦25,000 in kobo
    priority: 'NORMAL',
    address: 'Remote',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Package Delivery to Ikeja',
    description: 'Need someone to deliver a package from Victoria Island to Ikeja. Package is small and light.',
    category: 'DELIVERY',
    budget: 150000, // ₦1,500 in kobo
    priority: 'URGENT',
    address: '12 Adeola Odeku Street, VI',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Fix Leaking Faucet',
    description: 'My kitchen faucet is leaking and needs to be repaired or replaced. Please bring necessary tools.',
    category: 'REPAIRS',
    budget: 500000, // ₦5,000 in kobo
    priority: 'HIGH',
    address: '90 Allen Avenue, Ikeja',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Move Furniture to New Apartment',
    description: 'Need help moving furniture from my current apartment to a new one. About 2 hours of work.',
    category: 'OTHER',
    budget: 1000000, // ₦10,000 in kobo
    priority: 'NORMAL',
    address: '34 Ajose Adeogun Street',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Weekly Grocery Shopping',
    description: 'Looking for someone to do my weekly grocery shopping every Saturday morning.',
    category: 'SHOPPING',
    budget: 300000, // ₦3,000 in kobo
    priority: 'LOW',
    address: '56 Banana Island',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Office Cleaning Service',
    description: 'Need daily office cleaning for a small startup office. 5 days a week.',
    category: 'CLEANING',
    budget: 1500000, // ₦15,000 in kobo
    priority: 'NORMAL',
    address: '23 Ikorodu Road, Maryland',
    city: 'Lagos',
    state: 'Lagos',
  },
  {
    title: 'Laptop Screen Repair',
    description: 'My laptop screen is cracked and needs replacement. HP Pavilion model.',
    category: 'REPAIRS',
    budget: 3500000, // ₦35,000 in kobo
    priority: 'HIGH',
    address: '67 Computer Village, Ikeja',
    city: 'Lagos',
    state: 'Lagos',
  },
];

async function seedTasks() {
  console.log('🌱 Starting to seed tasks...\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < testTasks.length; i++) {
    const task = testTasks[i];
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/tasks`,
        task,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        successCount++;
        console.log(`✅ [${i + 1}/${testTasks.length}] Created: ${task.title}`);
      } else {
        failCount++;
        console.log(`❌ [${i + 1}/${testTasks.length}] Failed: ${task.title} - ${response.data.message}`);
      }
    } catch (error) {
      failCount++;
      let errorMsg = error.message;
      
      if (error.response) {
        // Server responded with error
        errorMsg = `${error.response.status} - ${error.response.data?.message || error.response.statusText}`;
        if (error.response.data?.errors) {
          errorMsg += ` | ${JSON.stringify(error.response.data.errors)}`;
        }
      } else if (error.request) {
        // Request made but no response
        errorMsg = 'No response from server. Is the backend running?';
      }
      
      console.log(`❌ [${i + 1}/${testTasks.length}] Error: ${task.title}`);
      console.log(`   ${errorMsg}\n`);
    }

    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n🎉 Seeding completed!');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
}

// Run the seeder
seedTasks().catch(console.error);
