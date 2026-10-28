// Official Administrative Districts of Assam (35 Districts)
// Reference: https://assam.gov.in/districts-page.html

export const ASSAM_DISTRICTS = [
  'Bajali',
  'Baksa',
  'Barpeta',
  'Biswanath',
  'Bongaigaon',
  'Cachar',
  'Charaideo',
  'Chirang',
  'Darrang',
  'Dhemaji',
  'Dhubri',
  'Dibrugarh',
  'Dima Hasao',
  'Goalpara',
  'Golaghat',
  'Hailakandi',
  'Hojai',
  'Jorhat',
  'Kamrup',
  'Kamrup Metropolitan',
  'Karbi Anglong',
  'Karimganj (Sribhumi)',
  'Kokrajhar',
  'Lakhimpur',
  'Majuli',
  'Morigaon',
  'Nagaon',
  'Nalbari',
  'Sivasagar',
  'Sonitpur',
  'South Salmara-Mankachar',
  'Tamulpur',
  'Tinsukia',
  'Udalguri',
  'West Karbi Anglong'
] as const;

export type AssamDistrict = typeof ASSAM_DISTRICTS[number];
