jadi ini fitur baru untuk form preservice untuk pasient on demand data Patient Affiliation / Patient Relationship

Secara model data:

User (Account) → affiliated with → multiple Patient records

Jadi misalnya:

Account A → Patient Fadhiilah
Account A → Patient Ibu
Account A → Patient Anak
Account A → Patient Teman

Kalau ingin lebih fleksibel dan tidak mengasumsikan semuanya keluarga, saya sarankan istilah domainnya Patient Affiliation atau Patient Association.

Untuk nama tabel, bisa misalnya:

patient_affiliations

dengan konsep:

user/account
    │
    ├── patient affiliation ──> patient A
    ├── patient affiliation ──> patient B
    └── patient affiliation ──> patient C
jadi ini fitur baru untuk form preservice untuk pasient on demand data Patient Affiliation / Patient Relationship

Secara model data:

User (Account) → affiliated with → multiple Patient records

Jadi misalnya:

Account A → Patient Fadhiilah
Account A → Patient Ibu
Account A → Patient Anak
Account A → Patient Teman

Kalau ingin lebih fleksibel dan tidak mengasumsikan semuanya keluarga, saya sarankan istilah domainnya Patient Affiliation atau Patient Association.

Untuk nama tabel, bisa misalnya:

patient_affiliations

dengan konsep:

user/account
    │
    ├── patient affiliation ──> patient A
    ├── patient affiliation ──> patient B
    └── patient affiliation ──> patient C

Kalau relasinya nanti perlu menyimpan konteks seperti “saya sendiri”, “ibu”, “anak”, “teman”, maka affiliation bisa punya atribut relationship_type. Tapi kalau memang sengaja ingin agnostik dan cukup berdasarkan nama, relationship type tidak perlu dipaksakan. jadi  keterangan tidak boleh dilakukan hardcoding  semua db driven data dari upstream
Oke, jadi sebenarnya ya, kita tuh udah terlalu banyak ini sih, terlalu banyak melampaui. Padahal data pasien itu pertama ya, setelah dia login, baik login menggunakan... ini kita fokus ke pasien dulu, oke? Pasien dulu. Baik dia login menggunakan Google atau masuk biasa, itu begini. Sebenarnya setelah autentikasi itu dia diminta ini lagi sih, seperti registrasi form gitu lagi. Nah, jadi check coba pelengkapannya ya. Jadi di front-end web itu dia butuh nama lengkap, kemudian NIK, kemudian nama ibu kandung, kemudian tempat lahir sesuai KTP gitu, kemudian tanggal lahirnya berapa, kemudian jenis kelaminnya apa. Nah, jenis kelamin ini kan pakai enum: laki atau perempuan, kayak gitu. Golongan darahnya apa? Jadi nggak hard coding ya, enum juga: A atau B atau AB atau O, atau belum tahu. Jadi ada enum-nya gitu: A atau B atau AB atau O, atau belum tahu, atau banyak lagi lah. Pokoknya yang golongan darah yang terdaftar gitu lah. Yang banyaknya. Kalau di front-end ini mereka cuma ada lima: A atau B atau AB atau O atau belum tahu gitu. Jadi ada opsi untuk belum tahu juga. Tapi kan kalau yang plus-plus kayak gitu, mungkin ada tambahan juga gitu kan. Kemudian data ini, data domisili. Jadi mungkin itu berbeda tabelnya atau gimana, saya nggak ngerti. Yang penting dia kanonikal lah ya tabelnya, jangan digabungin apa segala macam, profesional lah bagaimana. Jadi adalah gini, sekarang kamu tinggal di mana? form-nya gitu. Di situ ada field provinsinya apa, kemudian kabupatennya apa, kecamatannya apa, desanya apa, kemudian alamat detailnya apa, kayak gitu. Nah kemudian pekerjaannya apa gitu, pekerjaannya itu apa kayak gitu kan. Nah, pekerjaannya di sini itu identify aja dari sekarang gitu ya. Pakai enum juga mungkin. Atau mungkin pekerjaan ini tabelnya beda mungkin ya. Bukan-bukan, bukan enum kayaknya. Kayaknya apa namanya, harusnya tabelnya beda gitu pekerjaan. Nah ini nanti kamu bakalan isi aja pekerjaan-pekerjaan yang sesuai dengan ini lah, yang di Indonesia gitu, apa saja gitu kan. Jadi dia nggak hard coding. Jadi nanti admin bisa nambahin, atau saya sebagai developer bisa nambahin nama pekerjaannya apa saja kayak gitu. Nah jadi begitu. Nah nanti dia bakalan nyimpan tuh. Kemudian di janji temu di halaman pasien itu mereka butuh apa saja sih gitu kan.Nah, jadi, di sini ketika pasien itu tambah janji temu, sebenarnya ada kategori layanan ya. Jadi ada tabel layanan, dan itu pun juga nggak boleh hardcoding ya. Jadi bisa diextend lagi. Jadi untuk sekarang itu layanan itu ada dua gitu. Ada layanan umum dan layanan kebidanan. Nah, kalau layanan umum itu isinya ada USG, kemudian pemeriksaan umum, kemudian pengobatan keluhan ringan, kemudian cek tekanan darah, kemudian ECG, kemudian pemeriksaan laboratorium, kemudian nebulizer, kemudian pemeriksaan kehamilan, kemudian konsultasi kesehatan, kemudian surat keterangan kesehatan. Ya gitu. Kemudian kalau layanan bidan, itu ada persalinan, kemudian pemeriksaan kehamilan, kemudian perawatan nifas, kemudian keluarga berencana, kemudian vaginal toilet, kemudian imunisasi, kemudian pemeriksaan tumbuh kembang anak, kemudian konsultasi kesehatan reproduksi. Gitu. Nah, kira-kira begitu. Nah, jadi barulah kemudian dia setelah ngeklik, misalkan ya, contohnya USG. Nah, nanti dia disuruh milih tuh, milih apa namanya, milih semacam informasi, layanan dan keluhan. Ini saya lagi ini ya, maksudnya saya lagi mantau front-end-nya ya, dalam keadaan belum ada, dalam keadaan datanya masih dummy gitu ya. Jadi kita sebagai backend perlu membuatkan infrastrukturnya gitu. Nah, jadi di sini di modal reservasi janji temunya itu setelah milih misalkan USG gitu, kemudian nanti dia disuruh milih ini jenis kunjungannya apa. Nah, jadi jenis kunjungan ini tuh ada dua: pemeriksaan baru dan kontrol ulang. Itu pun datang dari database ya, DB-driven semua gitu. Kemudian nanti ada keluhan atau catatan medisnya apa. Keluhan atau catatan medis itu ya simpel lah, keluhan, udah simpel gitu. Nah, setelah itu, barulah dia nanti akan dibuat semacam ini, apa namanya, semacam antreannya ke berapa, kayak gitu. Jadi yang menentukan antrean itu adalah sistem berdasarkan antrean ya. Nah paradigma antrean itu kan karena si dokter udah ngebuat schedule. Jadi schedule pertama adalah antrean pertama, schedule, kayak gitu. Kan kalau sekarang kan kita lihat kan itu intervalnya 30 menit. Ya udah, simpel. Misalkan contoh ya, ini contoh, ini contoh aja. Misalkan shift pagi gitu. Sebenarnya tuh gini loh, kan satu hari itu kan banyak shift. Nah, ya udah. Kalau dokter itu adanya di... jadi dia berdasarkan schedule aja gitu. Misalkan dokter buat lima schedule. Lima schedule itu, satu ada di pagi hari, misalkan contoh jam 8 sampai jam 8:30, karena 30 menit kan intervalnya. Kemudian di siang hari ada jam 1 sampai jam 1:30. Kemudian di malam hari jam 9 sampai jam 9:30. Kemudian di hari... jam... apa namanya... jam... apa namanya itu... oh, salah-salah. Harusnya... ya itu. Nanti harusnya ya, harusnya. Oke, saya ulang lagi ya. Salah-salah, sorry-sorry. Jadi nanti pasien itu milih sesi pagi kah, mau sesi pagi atau sesi malam atau sesi siang, atau sesi apa gitu. Nah, nanti tuh dia kan ada empat sesi. Nah misalkan pasien itu milih sesi pagi gitu. Nah, itu pun juga harus dicek. Jadi nanti di front-end tuh ada yang ter-disable. Jadi dokter itu, sebuah dokter itu, apa namanya... Jadi nanti dia bakalan dikonektin ke dokter yang ini ya, apa namanya, sesuai dengan polinya gitu, sesuai dengan polinya. Kalau misalkan pasien itu awalnya tadi milih layanan umum, berarti kan poli umum. Nah dia bakalan ngecek dokter yang poli umum. Nah, misalkan contoh dokter X gitu. Dan kebetulan dia adalah poli umum gitu kan, ya udah. Nanti dia bakalan ngecek si dokter ini untuk shift-nya adanya di jam berapa aja. Kalau adanya di empat shift, ya udah. Nanti di front-end nanti sesimpel hidup semua dia, nggak ada yang ter-disable. Nah kalau contoh misalkan si dokter itu ada schedule-nya di dua sesi, pagi dan siang, ya udah selebihnya kena disable, kayak gitu. Kira-kira begitulah kalau di front-end nanti gitu ya. Nah, kemudian contoh misalkan nanti pasien yang melihat, oh pagi udah penuh, atau mungkin siangnya udah penuh, atau... jadi nggak usah bingung lah gitu. Nanti di front-end tuh sesimpel ter-disable aja, nggak usah ada kayak status apa penuh atau segala macam, nggak usah ada, gitu. Jadi backend tuh ngasih simpel aja gitu, simpel. Nggak usah, apa namanya, nggak usah streetpot gitu. Ya kalau penuh ya berarti ter-disable, kalau nggak ada, apa namanya, belum ada dijadwalkan, nah bagaimana, gitu kan. Kalau belum ada dijadwalkan ya tutup juga, apa namanya, bukan tutup ya, ter-disable juga, simpel aja gitu, simpel. Jadi dia memang ngecek gitu loh, ngecek secara efektif schedule-nya apa gitu loh. Misalkan contoh yang ini contoh ya, contoh. Misalkan sesi pagi ada nih kebuka gitu. Nah, pas dia ngeklik, ya udah, dia bakalan ngecek pasien mana, sesuai urutan aja gitu. Kalau misalkan di pagi hari itu kan ada 12 slot ya. 12 slot gitu. Kalau dia... apa namanya... kalau si dokter itu ngebuat jadwalnya itu dari jam 6, ya itu kan dinamis ya. Kalau jam 6, 6 ke 6:30, 6:30 ke 7, jam 7, kemudian jam 7 ke jam 7:30 kan, kayak gitu seterusnya kan ada kiranya 24... eh salah, 24... 12 apa 24? Kayak gitulah pokoknya. Tapi yang jelas segini aja, simpel aja. Jadi logikanya itu berdasarkan si dokter itu buatnya apa, ngebuka jadwalnya itu di jam berapa aja, gitu. Udah simpel gitu loh. Di jam berapa aja, gitu. Misalkan dokter paginya ngebuat 4 gitu, 4 slot. Misalkan jam 6 sampai 7:30 dan seterusnya kayak gitulah pokoknya. Kan memang jam terakhir itu kan nggak ditentukan, karena udah auto interval 30, gitu kan. Nah, ya udah. Katakanlah ada tiga orang pasien yang udah ngebooking dari awal. Ya udah berarti kan pasien baru ini ya ke antrean keempat, simpel aja gitu. Jadi dia bakalan ngecek sekarang tuh antrean keberapa yang terakhir. Misalkan antrean ketiga, berarti pasien baru kan bakalan dapat antrean keempat gitu, simpel. Ya udah. Dan seterusnya dan seterusnya kayak gitu. Kayak gitu sih alurnya, simpel lah begitu.Tapi formulir ini yang dapetin data domisili dan seterusnya tadi, yang dari nama lengkap sampai ke pekerjaan itu tadi, urutannya, itu sebenarnya bakalan ditanyain terus kalau di front-end, gitu loh. Jadi dia per... apa namanya... jadi sistemnya itu gini. Karena kan pasien ini kadang kala dia mau daftarin ininya kan. Jadi dia sistemnya itu agnostik gitu loh. Dia on demand sebenarnya formulir itu ditampilkan, gitu. Misalkan seorang ibu mau daftarin anaknya untuk anu, gitu kan, mau berobat gitu kan. Jadi formulir itu tuh sebenarnya dimintain ketika dia mau buat layanan sebenarnya. Jadi ada dua sih kategorinya, milik dia sendiri. Artinya nanti waktu pengisian layanan itu, apa namanya, waktu sebelum pengisian layanan kan dia diwajibkan untuk mengisi formulir itu kan. Nah itu untuk saya sendiri atau statusnya itu untuk saya sendiri atau ini, atau keluarga gitu. Kayak gitu. Jadi dia sistemnya itu satu orang itu punya hierarkinya lagi. Apa ya namanya ya? Pokoknya kayak gitu lah. Kadang kita mengisi untuk ibu kita atau ayah kita atau anak-anak kita, gitu. Ya pokoknya statusnya kayak gitu. Nah di database bagaimana dia, gitu loh. Di database bagaimana gitu. Nanti kalau sekiranya untuk dia sendiri, nanti kan dia pasti bakalan ini sih milihnya untuk dia sendiri. Nah nanti besok waktu selanjutnya itu waktu anukan layanan, gitu ya. Anukan layanan, maksudnya berlayanan lagi gitu. Karena dia simpelnya kalau untuk dia sendiri kan udah ada datanya di dalam database, jadi nggak perlu ngisi ulang lagi, gitu. Nah tapi ya itu nanti front-end yang ini, yang menentukan untuk diri sendiri apa untuk siapa nih, gitu. Nanti dia bakalan memunculkan data yang pernah dia isi, gitu. Misalkan data mama nya lah, atau data bapaknya lah, atau data siapanya lah. Nanti dia simpelnya nanti di front-end itu ngelist nama anggota keluarganya, gitu mungkin ya. Gitu nama anggota keluarganya. Tapi gini, jangan anggota keluarga juga. Sebenarnya tuh ya dinamis sih, dinamis aja gitu, nggak usah anggota keluarga. Jadi dia by nama aja, nama. Bisa juga dia mau apakan temannya. Jadi nggak usah diverbatimkan, nggak usah di-exactkan, gitu loh. Ya by nama aja. Nama ini terafiliasi dengan si fulan, misalkan gitu. Nanti dia bakalan ini untuk siapa, misalkan untuk Rizki atau untuk siapa. Nah udah langsung masuk, gitu loh. Jadi nggak perlu inputkan ulang lagi, gitu. Jadi kira-kira begitu sistem database-nya bagaimana nanti, gitu kan. Jadi kira-kira begitu. Nah barulah, barulah di sini Anda perbaiki seedernya di database. Seeder di database itu bagaimana, gitu loh. Nah gitu. Jadi NIK yang diambil itu memang sengaja tidak terafiliasi pada autentikasi. Bukan, dia itu NIK. Pokoknya paradigma semuanya ini itu agnostik sebenarnya, gitu.
Saat ini frontend telah mendesain alur pendaftaran layanan dengan paradigma bahwa data pasien dikumpulkan **on-demand**, yaitu ketika pengguna akan membuat atau mendaftarkan suatu layanan. Formulir data pasien tidak ditampilkan sebagai proses wajib setelah autentikasi, melainkan menjadi bagian dari flow sebelum pengguna melanjutkan ke proses layanan.

Dalam flow yang telah didesain oleh tim frontend, pengguna terlebih dahulu menentukan layanan tersebut akan didaftarkan untuk siapa. Identitas tersebut dapat berupa dirinya sendiri maupun individu lain yang ingin didaftarkan melalui akun yang sedang digunakan. Karena itu, konsep ini tidak perlu dibatasi sebagai “anggota keluarga”; sistem cukup memungkinkan pengguna memilih identitas pasien berdasarkan data yang telah tersedia atau membuat data pasien baru ketika identitas tersebut belum tersedia.

Ketika data pasien belum tersedia, frontend akan menampilkan formulir untuk melengkapi informasi pasien sebelum proses layanan dapat dilanjutkan. Data yang dibutuhkan meliputi nama lengkap, NIK, nama ibu kandung, tempat lahir sesuai KTP, tanggal lahir, jenis kelamin, golongan darah, data domisili, dan pekerjaan. Setelah data berhasil disimpan, data tersebut harus dapat digunakan kembali pada proses pendaftaran layanan berikutnya sehingga pengguna tidak perlu mengisi ulang informasi yang sama.

Dengan demikian, kebutuhan tersebut perlu didukung secara langsung oleh **Patient Module pada backend**. Backend perlu menyediakan model data, persistence, API contract, validation, serta relasi yang diperlukan agar frontend dapat menjalankan flow yang telah didesain tanpa membuat atau menyimpan state pasien secara mandiri di sisi frontend.

Backend juga perlu melakukan **schema migration untuk Patient Module** agar struktur database mampu merepresentasikan kebutuhan tersebut secara canonical. Data pasien harus menjadi entitas domain tersendiri dan tidak boleh diperlakukan sebagai sekadar ekstensi dari data autentikasi. Akun yang sedang digunakan hanya menjadi konteks pihak yang melakukan proses pendaftaran, sedangkan identitas pasien tetap dapat digunakan secara independen dalam konteks layanan.

Struktur data juga perlu dipisahkan berdasarkan tanggung jawab domain. Data pasien, domisili, pekerjaan, serta data referensi lain yang memang bersifat reusable harus memiliki representasi yang sesuai pada database. Nilai yang bersifat extensible, seperti daftar pekerjaan dan layanan, tidak boleh ditanamkan sebagai hardcoded value pada frontend. Frontend harus memperoleh data tersebut melalui backend berdasarkan data yang tersedia pada database.

Setelah Patient Module tersedia, backend perlu menyediakan kemampuan bagi frontend untuk melakukan dua kondisi utama: menggunakan kembali pasien yang telah tersimpan sebelumnya atau membuat pasien baru ketika data pasien tersebut belum tersedia. Dengan pendekatan tersebut, frontend cukup menampilkan daftar identitas yang tersedia, memilih pasien yang dituju, dan melanjutkan proses layanan tanpa melakukan duplikasi data pasien.

Implementasi ini menjadi dasar bagi proses appointment berikutnya. Setelah pasien berhasil ditentukan, frontend dapat melanjutkan pemilihan layanan, jenis kunjungan, keluhan atau catatan, sesi pelayanan, hingga proses penentuan antrean. Seluruh data tersebut harus tetap mengikuti sumber kebenaran dari backend dan database, sementara frontend bertanggung jawab terhadap representasi dan interaksi pengguna sesuai flow yang telah dirancang.

Oleh karena itu, pekerjaan backend pada tahap ini bukan sekadar menyesuaikan endpoint terhadap tampilan frontend, tetapi **menyediakan fondasi domain Patient Module beserta schema migration-nya** sehingga flow pendaftaran yang sudah dirancang frontend dapat berjalan menggunakan data nyata, persistent, reusable, dan database-driven.

jadi seeder si schedule perlu di perbaharui biar sync, kemudian buatkan seeder patient  dan data patient form itu juga,  jadi intinya sebelum select layananan dia perlu isi form sesimple itu sih,kemudian nanti di frontendn itu pada halaman janji temu Oke. Jadi kemudian di halaman janji temu di sisi pasien, di web, itu Frontend udah nge-design di halaman pertama janji temu. Itu kan berdasarkan kartu ya. Jadi saya contohin satu kartunya, itu ada komposisi daripada pertama avatar user, kemudian ada, eh sorry, avatarnya si dokter satu. Habis itu ada nama dokternya apa, kemudian dia poli apa, kemudian tanggal schedule-nya, kemudian ruangannya apa, kemudian jam mulainya berapa, kemudian jam selesainya jam berapa, gitu. Kemudian, apa namanya, kemudian kalau di-click detail, itu nanti semuanya bakalan muncul, ditambah emailnya user apa, emailnya pasien, eh salah deh. salah, bukan email. Nama pasiennya apa, keluhannya apa, kemudian ya itulah, terkait data formulir yang di-inputkan sebelumnya, gitu. Detailnya gitu. Sebenarnya isinya itu formulir sebenarnya, formulir yang itu, cuman ya begitu, gitu. Kemudian juga di sini sebenarnya dia bisa nge-reschedule juga ya. Pasien bisa nge-reschedule-kan, gitu. Pasien bisa nge-reschedule-kan, gitu. Nanti pas di-click reschedule untuk schedule terkait, itu dia nanti backend bakalan ngasih jadwal dokter terkait yang kosong apa saja, gitu. Kalau memang sekiranya kosongnya nggak ada, berarti tombol di tombol apa namanya itu, oh sorry, kalau kan gitu. Pas di schedule, otomatis di dalamnya itu list daripada schedule si dokter yang kosong apa saja, gitu. Hanya yang kosong. Nah, jadi perlu dilihat kondisi-kondisinya gitu. Jangan asal ini. Jangan asal ngasih, gitu. Jadi kira-kira itu sih kebutuhan di frontend. Jadi frontend itu nggak perlu ini lagi, kalkulasi dan nge-filter-filter lagi, nggak usah. Simpelnya gitu sih. Jadi semua keperluannya itu udah di-handle backend, kayak gitu.Kemudian mereka, kemudian di sisi alaman pasien itu simpelnya tinggal di-render aja gitu. Mereka nge-consume apa yang kirim oleh backend. design decoupled dan agnostic, serta syntaks tidak boleh lebih dari 500 bari LOC Oh iya, dan juga nanti di front-end itu ada mekanisme pembatalan ya. Di aNah jadi, jadi, apa namanya, jadi di Flutter mobile internal klinik sama admin, pertanyaannya kenapa mereka bisa nge-reschedule kan gitu kan. Sebenarnya itu niat saya itu siapa tahu nih dokternya lagi berhalangan, jadi ada urgency atau apa gitu kan. Itu proyek apa ya, maksudnya ini cerita saya gitu ya. Kan kalau sekarang kan udah ada mekanisme seperti itu dan udah dipasang juga di Flutter dan di web admin udah ada gitu. Jadi nanti ketika internal klinik yang mereschedule kan, itu notifikasi ada di si pasien bahwa misalnya jadwal kamu pada tanggal sekian-sekian-sekian di jam sekian-sekian-sekian dengan layanannya sekian-sekian-sekian itu di-reschedule kan ke jam terbaik. Jadi nanti di pasien itu bisa melihat di halaman dirinya sendiri di-reschedule kan, kayak gitu. Kira-kira begitulah.ksinya itu ada dua, kalau di halaman itu, di halaman janji temu itu ada dua: cancel dan juga reschedule, kayak gitu. Nah, kalau cancel ya, kalau di cancel kan berarti slotnya hidup lagi gitu kan. Artinya jadwal dokter itu hidup lagi gitu. Udah ada sih sebenarnya sekarang, cuman perlu disesuaikan lagi karena requirement yang sekarang tuh nambah lagi gitu kan. Jadi pertama buat dulu modul pasiennya ya, kemudian nanti lakukan pengetesan sesuai end-to-end yang sekarang ini, gitu. Nah, jadi yang terjadi gitu ya, kalau nge-cancel atau reschedule, otomatis di dashboard-nya si admin, gitu ya, di dashboard-nya si admin, harusnya tuh ada ini ya, harusnya ada notifikasi gitu loh, bahwa misalnya pasien X itu sedang mengajukan reschedule gitu atau meng-cancel. Nanti di admin itu, admin atau di Flutter halaman mobile gitu ya. Ya sebenarnya sama aja sih, sama aja sebenarnya. Kalau di internal klinik mereka itu, itu bisa dilihat gitu loh pasien tersebut itu reschedule atau dia nge-cancel, cancel. Nah, jadi kira-kira gitu.gaboleh hardcoging, pakai constant paradigm, cek dto dan seterus nya, kemudian nanti anda buatkan changelog baru ingat baru bukan edit yang lama lakukan test endtoend ketika sudah di rebuild docker nya,## Patient Module & Appointment Flow

Saat ini frontend telah mendesain alur pendaftaran layanan dengan paradigma **on-demand patient data**. Artinya, data pasien tidak dikumpulkan sebagai proses wajib segera setelah autentikasi, tetapi hanya diminta ketika pengguna akan membuat atau mendaftarkan suatu layanan.

Dengan demikian, setelah pengguna melakukan autentikasi, sistem tidak langsung memaksa pengguna mengisi seluruh data pasien. Data pasien baru akan diminta ketika pengguna melanjutkan ke proses layanan.

### Patient Selection & Affiliation

Pada awal proses pendaftaran layanan, pengguna harus menentukan layanan tersebut akan didaftarkan untuk siapa. Identitas tersebut dapat berupa dirinya sendiri maupun individu lain yang ingin didaftarkan menggunakan akun yang sedang aktif.

Konsep ini **tidak boleh dikunci sebagai family member atau anggota keluarga**, karena hubungan tersebut terlalu spesifik. Satu akun dapat terafiliasi dengan beberapa data pasien tanpa mengasumsikan hubungan keluarga.

Secara konseptual:

```text
User / Account
    │
    ├── Patient Affiliation → Patient A
    ├── Patient Affiliation → Patient B
    ├── Patient Affiliation → Patient C
    └── Patient Affiliation → Patient D
```

Contohnya:

```text
Account A
├── Patient Fadhiilah
├── Patient Ibu
├── Patient Anak
└── Patient Teman
```

Karena relasi tersebut bersifat agnostik, nama domain yang digunakan sebaiknya merepresentasikan hubungan antara account dan patient, misalnya `Patient Affiliation` atau `Patient Association`.

Apabila pada masa mendatang diperlukan informasi seperti `self`, `mother`, `child`, `friend`, dan sebagainya, informasi tersebut dapat direpresentasikan sebagai atribut relasi. Namun, relationship type tidak perlu dipaksakan apabila requirement saat ini hanya membutuhkan hubungan account terhadap patient berdasarkan identitas pasien.

### Patient Data

Apabila pasien yang dipilih belum tersedia, frontend akan menampilkan patient form sebelum pengguna dapat melanjutkan ke pemilihan layanan.

Data patient form yang perlu didukung backend meliputi:

* Full name
* NIK
* Nama ibu kandung
* Tempat lahir sesuai KTP
* Tanggal lahir
* Jenis kelamin
* Golongan darah
* Provinsi
* Kabupaten/Kota
* Kecamatan
* Desa/Kelurahan
* Alamat detail
* Pekerjaan

Data tersebut harus disimpan secara persistent dan dapat digunakan kembali pada proses pendaftaran layanan berikutnya.

Apabila pengguna sebelumnya telah membuat data pasien untuk dirinya sendiri atau individu lain, frontend harus dapat mengambil kembali data tersebut dan menampilkannya sebagai pilihan. Pengguna tidak perlu mengisi ulang patient form yang sama.

Dengan demikian, frontend cukup melakukan:

```text
Select existing patient
        ↓
Use patient data
        ↓
Continue service registration
```

atau:

```text
Create new patient
        ↓
Save patient data
        ↓
Use newly created patient
        ↓
Continue service registration
```

### Patient Module

Kebutuhan tersebut harus didukung melalui **Patient Module pada backend**.

Backend harus menyediakan:

* domain model
* database schema
* schema migration
* persistence
* validation
* DTO
* API contract
* patient-affiliation relationship
* patient retrieval
* patient creation/update sesuai kebutuhan flow
* integration dengan appointment/service registration

Patient harus menjadi entitas domain tersendiri dan **tidak boleh dianggap sebagai ekstensi dari authentication user**.

Authentication hanya menentukan account yang sedang melakukan tindakan. Identitas pasien tetap merupakan entitas independen yang dapat digunakan dalam konteks layanan.

NIK juga merupakan data pasien dan **tidak boleh diasumsikan sebagai authentication identifier**.

### Canonical Data Model

Struktur database harus mengikuti pemisahan tanggung jawab domain.

Patient data, domicile/address data, employment reference, service reference, dan data referensi lain yang memiliki lifecycle atau reuse tersendiri harus direpresentasikan secara canonical pada database.

Jangan menggabungkan seluruh data tersebut secara sembarangan hanya untuk mengikuti kebutuhan form frontend.

Database harus menjadi **single source of truth**.

Frontend tidak boleh memiliki:

* hardcoded patient data
* hardcoded employment options
* hardcoded service options
* hardcoded visit types
* hardcoded schedule availability
* hardcoded queue calculation
* fallback data
* duplicate domain mapping
* magic string untuk nilai domain

Semua data yang bersifat configurable atau extensible harus berasal dari backend/database.

---

## Employment Reference

Pekerjaan tidak diperlakukan sebagai hardcoded enum pada frontend.

Daftar pekerjaan harus memiliki sumber data yang dapat diperluas. Dengan demikian, administrator atau developer dapat menambahkan pekerjaan baru tanpa harus mengubah source code frontend.

Frontend cukup melakukan consumption terhadap data pekerjaan yang diberikan backend.

---

## Service & Visit Type

Setelah patient berhasil ditentukan, pengguna dapat melanjutkan ke pemilihan layanan.

Service harus berasal dari database dan tidak boleh di-hardcode pada frontend.

Untuk kebutuhan saat ini terdapat dua kategori layanan:

### Layanan Umum

* USG
* Pemeriksaan umum
* Pengobatan keluhan ringan
* Cek tekanan darah
* ECG
* Pemeriksaan laboratorium
* Nebulizer
* Pemeriksaan kehamilan
* Konsultasi kesehatan
* Surat keterangan kesehatan

### Layanan Kebidanan

* Persalinan
* Pemeriksaan kehamilan
* Perawatan nifas
* Keluarga berencana
* Vaginal toilet
* Imunisasi
* Pemeriksaan tumbuh kembang anak
* Konsultasi kesehatan reproduksi

Daftar tersebut merupakan seed/reference data untuk kondisi saat ini, bukan alasan untuk melakukan hardcoding pada application layer.

Setelah service dipilih, pengguna memilih jenis kunjungan.

Untuk saat ini terdapat:

* Pemeriksaan baru
* Kontrol ulang

Visit type juga harus bersumber dari database dan dikirim melalui API.

Frontend hanya melakukan rendering terhadap data yang diberikan backend.

---

## Complaint / Medical Note

Setelah service dan visit type ditentukan, pengguna dapat memasukkan keluhan atau catatan yang relevan dengan layanan.

Data tersebut menjadi bagian dari appointment/service registration dan harus disimpan oleh backend sebagai bagian dari record layanan.

Frontend tidak perlu menentukan struktur domain atau melakukan business calculation terhadap data tersebut.

---

# Doctor Schedule & Session Availability

Appointment harus mengikuti schedule dokter yang telah tersedia pada backend.

Frontend tidak boleh menghitung sendiri schedule, interval, availability, maupun queue.

Dokter terhubung dengan poli/service context yang sesuai.

Sebagai contoh, apabila pengguna memilih layanan yang berada pada poli umum, backend menentukan dokter yang relevan berdasarkan data schedule dan relasi domain yang tersedia.

Kemudian backend menentukan sesi pelayanan yang tersedia berdasarkan schedule dokter.

Sistem menggunakan empat sesi pelayanan sesuai schedule policy yang telah digunakan pada sistem.

Schedule bersifat dinamis berdasarkan schedule yang dibuat dokter.

Contohnya, apabila dokter membuat schedule:

```text
06:00 – 06:30
06:30 – 07:00
07:00 – 07:30
07:30 – 08:00
```

maka availability berasal dari schedule tersebut.

Frontend tidak boleh membuat interval tersebut sendiri.

Schedule factory / domain logic pada backend tetap menjadi sumber pembentukan session berdasarkan schedule yang telah ditentukan.

---

# Session Availability

Pada appointment flow, frontend hanya membutuhkan informasi apakah sesi dapat dipilih atau tidak.

Backend harus menentukan kondisi tersebut berdasarkan data aktual:

* doctor schedule
* existing appointments
* slot capacity
* session availability
* relevant appointment state

Frontend kemudian cukup melakukan rendering:

```text
Available     → selectable
Unavailable   → disabled
Not scheduled → disabled
```

Frontend tidak perlu melakukan filtering ulang untuk menentukan apakah sebuah sesi tersedia.

Tidak perlu mengirimkan business calculation mentah kepada frontend apabila frontend hanya membutuhkan hasil akhirnya untuk menentukan apakah pilihan dapat digunakan.

Dengan demikian, frontend tidak perlu memahami internal calculation backend.

---

# Queue Assignment

Nomor antrean ditentukan oleh backend.

Apabila terdapat appointment sebelumnya pada schedule/session yang sama, appointment berikutnya mendapatkan nomor antrean berdasarkan urutan appointment yang valid.

Contoh:

```text
Patient A → Queue 1
Patient B → Queue 2
Patient C → Queue 3
Patient D → Queue 4
```

Apabila antrean terakhir adalah `3`, patient berikutnya memperoleh antrean `4`.

Frontend tidak menghitung nomor antrean tersebut.

Frontend hanya menampilkan queue number yang diberikan backend.

---

# Patient Appointment Page

Pada halaman appointment pasien di web, frontend telah mendesain appointment menggunakan card.

Card tersebut menampilkan informasi yang berasal dari backend, antara lain:

* doctor avatar
* doctor name
* doctor poly / service context
* appointment date
* room
* start time
* end time

Frontend hanya melakukan rendering terhadap response backend.

Tidak boleh ada perhitungan ulang terhadap:

* date
* start time
* end time
* doctor schedule
* queue
* availability
* status domain

---

# Appointment Detail

Ketika pengguna membuka detail appointment, backend harus menyediakan data yang diperlukan frontend untuk menampilkan detail tersebut.

Informasi dapat mencakup:

* patient name
* selected service
* visit type
* complaint / medical note
* appointment schedule
* doctor
* room
* queue
* patient form data yang relevan

Patient form yang telah diisi sebelumnya merupakan bagian dari data patient dan dapat digunakan kembali.

Frontend tidak perlu membuat ulang struktur patient data dari berbagai sumber atau melakukan duplicate mapping apabila backend telah menyediakan DTO yang sesuai.

---

# Reschedule

Appointment memiliki dua action utama pada sisi pasien:

```text
Cancel
Reschedule
```

Untuk reschedule, frontend tidak melakukan filtering schedule sendiri.

Ketika pasien meminta reschedule, backend harus menyediakan schedule dokter yang relevan dan masih dapat dipilih berdasarkan kondisi aktual.

Response hanya perlu menyediakan schedule yang valid untuk dipilih.

Apabila tidak terdapat schedule yang tersedia, frontend menampilkan empty state sesuai contract backend.

Tidak boleh ada fallback schedule atau dummy schedule.

---

# Cancellation

Ketika pasien melakukan cancellation, backend harus memproses perubahan appointment state secara transactional sesuai business rule.

Slot yang sebelumnya digunakan oleh appointment tersebut harus kembali diperhitungkan sebagai available apabila state appointment memang memenuhi kondisi untuk mengembalikan availability.

Frontend tidak melakukan manipulasi availability secara lokal.

Setelah cancellation berhasil, frontend melakukan refresh/consumption terhadap state terbaru dari backend.

---

# Internal Reschedule

Selain pasien, internal clinic melalui Flutter maupun admin web juga dapat melakukan reschedule terhadap appointment.

Use case ini diperlukan ketika terdapat perubahan schedule dari sisi internal klinik, misalnya dokter memiliki perubahan availability.

Ketika appointment di-reschedule oleh internal clinic, perubahan tersebut harus tercatat pada backend dan menjadi state canonical appointment.

Patient kemudian harus dapat melihat bahwa appointment-nya telah mengalami perubahan schedule.

Informasi reschedule harus mencakup data aktual seperti:

* patient
* service
* previous schedule
* new schedule
* appointment date
* new time
* relevant appointment state

Apabila sistem notification telah tersedia, perubahan tersebut harus menghasilkan notification yang dapat dikonsumsi oleh sisi pasien.

---

# Internal Appointment Notification

Pada sisi internal clinic, admin dan Flutter internal application juga harus dapat mengetahui perubahan appointment yang dilakukan oleh pasien.

Apabila pasien melakukan:

```text
Reschedule
```

atau:

```text
Cancel
```

maka internal clinic harus dapat mengetahui perubahan tersebut.

Dengan demikian, backend harus menyediakan state dan event/notification data yang diperlukan untuk mendukung flow tersebut.

Frontend web admin dan Flutter internal tidak boleh membuat status perubahan sendiri.

Keduanya harus mengonsumsi state yang diberikan backend.

---

# Backend–Frontend Responsibility

Arsitektur harus tetap **decoupled dan agnostic**.

Backend bertanggung jawab terhadap:

* domain rules
* persistence
* validation
* schedule calculation
* availability
* queue assignment
* appointment state
* patient relationship
* service reference
* visit type reference
* notification state
* DTO
* API contract

Frontend bertanggung jawab terhadap:

* rendering
* user interaction
* loading state
* empty state
* error state
* navigation
* form interaction

Frontend **tidak boleh mengambil alih business logic backend**.

Tidak boleh terdapat:

* hardcoded domain values
* magic strings
* dummy fallback data
* frontend-generated schedule
* frontend-generated queue number
* frontend availability calculation
* duplicate status mapping
* duplicate business rules
* arbitrary default values untuk menutupi response backend yang kosong

Apabila backend tidak memberikan data, frontend harus menampilkan empty state berdasarkan contract.

---

# Constant & Domain Value Policy

Seluruh nilai yang digunakan secara berulang dalam backend harus mengikuti constant/domain-value paradigm.

Jangan menyebarkan string literal seperti:

```text
"cancelled"
"rescheduled"
"available"
"general"
"midwife"
```

di berbagai bagian source code.

Gunakan constant, enum, value object, atau domain representation yang sesuai dengan sifat data tersebut.

Namun, jangan mengubah data yang seharusnya bersifat database-driven menjadi enum hanya untuk menghindari hardcoding.

Prinsipnya:

```text
Stable domain state
    → Constant / Enum / Domain Type

Extensible reference data
    → Database / Reference Table

Runtime data
    → Database / API

UI representation
    → DTO / API Contract
```

---

# DTO & API Contract

Sebelum melakukan perubahan frontend, backend harus terlebih dahulu memastikan DTO dan API contract telah merepresentasikan kebutuhan domain.

Setiap endpoint yang digunakan frontend harus memiliki contract yang jelas mengenai:

* request
* response
* required field
* optional field
* nullable field
* enum/domain value
* relation
* pagination jika diperlukan
* validation error
* business error
* empty response
* state transition

DTO tidak boleh dibuat sekadar mengikuti struktur component frontend apabila struktur tersebut tidak merepresentasikan domain.

DTO harus menjadi boundary antara domain/backend dan consumer.

---

# Database Migration

Backend harus membuat **schema migration baru untuk Patient Module**.

Migration harus mencakup struktur database yang diperlukan untuk:

* patient
* patient affiliation
* patient domicile/address apabila dipisahkan sebagai domain
* employment reference
* service reference apabila belum tersedia
* visit type reference apabila belum tersedia
* relationship yang dibutuhkan appointment

Schema harus canonical dan normalized sesuai tanggung jawab domain.

Jangan melakukan denormalisasi hanya untuk mempermudah frontend.

---

# Seeder

Seeder yang sudah ada harus diperbarui agar data schedule tetap sinkron dengan requirement terbaru.

Selain itu, harus dibuat seeder baru untuk Patient Module yang mencakup:

* patient records
* patient affiliation
* patient form data
* domicile/address reference jika diperlukan
* employment reference
* service reference
* visit type reference
* schedule data yang diperlukan untuk end-to-end testing

Seeder harus menghasilkan data yang konsisten secara relational.

Tidak boleh terdapat seed data yang hanya dibuat agar UI terlihat terisi tetapi tidak memiliki relasi domain yang valid.

---

# Testing Requirement

Setelah migration, seeder, DTO, API contract, dan implementation selesai, lakukan testing secara end-to-end.

Testing harus dilakukan terhadap flow aktual:

```text
Authentication
    ↓
Patient Selection
    ↓
Create / Select Patient
    ↓
Patient Form
    ↓
Service Selection
    ↓
Visit Type
    ↓
Complaint / Medical Note
    ↓
Doctor / Poly Context
    ↓
Session Selection
    ↓
Availability Validation
    ↓
Queue Assignment
    ↓
Appointment Creation
    ↓
Appointment Detail
    ↓
Reschedule
    ↓
Cancel
    ↓
Internal Notification / State Update
```

Testing harus dilakukan menggunakan database dan service yang benar-benar dijalankan melalui Docker.

Setelah implementation selesai, rebuild Docker environment terlebih dahulu, kemudian jalankan end-to-end test terhadap environment hasil rebuild tersebut.

Jangan menganggap implementation berhasil hanya karena unit atau static check berhasil.

---

# Changelog

Buat **changelog baru** untuk perubahan requirement ini.

Jangan mengedit changelog lama hanya untuk memasukkan perubahan baru.

Changelog baru harus mendokumentasikan perubahan yang dilakukan pada:

* Patient Module
* patient schema
* patient affiliation
* patient migration
* patient DTO
* API contract
* patient seeder
* employment reference
* service reference
* visit type reference
* schedule seeder
* appointment flow
* reschedule
* cancellation
* notification/state handling
* testing

Changelog harus menjelaskan perubahan contract yang berdampak terhadap consumer, terutama web patient, web admin, dan Flutter internal application.

---

# Code Structure Constraint

Implementasi harus tetap modular dan maintainable.

Setiap file harus memiliki responsibility yang jelas.

**Tidak boleh membuat God Object, God Service, atau file dengan tanggung jawab yang terlalu luas.**

Source file harus dijaga agar tidak melebihi **500 LOC**.

Apabila sebuah file mendekati atau melebihi batas tersebut, pecah berdasarkan responsibility/domain concern, bukan sekadar memindahkan baris secara arbitrer.

Gunakan prinsip:

```text
Single Responsibility
Dependency Inversion
Separation of Concerns
DRY
SSOT
Domain-driven boundaries
```

Tujuan akhirnya adalah menghasilkan Patient Module dan appointment infrastructure yang benar-benar menjadi sumber data canonical bagi seluruh consumer, bukan sekadar menyesuaikan backend terhadap dummy data frontend.

Kalau relasinya nanti perlu menyimpan konteks seperti “saya sendiri”, “ibu”, “anak”, “teman”, maka affiliation bisa punya atribut relationship_type. Tapi kalau memang sengaja ingin agnostik dan cukup berdasarkan nama, relationship type tidak perlu dipaksakan. jadi  keterangan tidak boleh dilakukan hardcoding  semua db driven data dari upstream
Oke, jadi sebenarnya ya, kita tuh udah terlalu banyak ini sih, terlalu banyak melampaui. Padahal data pasien itu pertama ya, setelah dia login, baik login menggunakan... ini kita fokus ke pasien dulu, oke? Pasien dulu. Baik dia login menggunakan Google atau masuk biasa, itu begini. Sebenarnya setelah autentikasi itu dia diminta ini lagi sih, seperti registrasi form gitu lagi. Nah, jadi check coba pelengkapannya ya. Jadi di front-end web itu dia butuh nama lengkap, kemudian NIK, kemudian nama ibu kandung, kemudian tempat lahir sesuai KTP gitu, kemudian tanggal lahirnya berapa, kemudian jenis kelaminnya apa. Nah, jenis kelamin ini kan pakai enum: laki atau perempuan, kayak gitu. Golongan darahnya apa? Jadi nggak hard coding ya, enum juga: A atau B atau AB atau O, atau belum tahu. Jadi ada enum-nya gitu: A atau B atau AB atau O, atau belum tahu, atau banyak lagi lah. Pokoknya yang golongan darah yang terdaftar gitu lah. Yang banyaknya. Kalau di front-end ini mereka cuma ada lima: A atau B atau AB atau O atau belum tahu gitu. Jadi ada opsi untuk belum tahu juga. Tapi kan kalau yang plus-plus kayak gitu, mungkin ada tambahan juga gitu kan. Kemudian data ini, data domisili. Jadi mungkin itu berbeda tabelnya atau gimana, saya nggak ngerti. Yang penting dia kanonikal lah ya tabelnya, jangan digabungin apa segala macam, profesional lah bagaimana. Jadi adalah gini, sekarang kamu tinggal di mana? form-nya gitu. Di situ ada field provinsinya apa, kemudian kabupatennya apa, kecamatannya apa, desanya apa, kemudian alamat detailnya apa, kayak gitu. Nah kemudian pekerjaannya apa gitu, pekerjaannya itu apa kayak gitu kan. Nah, pekerjaannya di sini itu identify aja dari sekarang gitu ya. Pakai enum juga mungkin. Atau mungkin pekerjaan ini tabelnya beda mungkin ya. Bukan-bukan, bukan enum kayaknya. Kayaknya apa namanya, harusnya tabelnya beda gitu pekerjaan. Nah ini nanti kamu bakalan isi aja pekerjaan-pekerjaan yang sesuai dengan ini lah, yang di Indonesia gitu, apa saja gitu kan. Jadi dia nggak hard coding. Jadi nanti admin bisa nambahin, atau saya sebagai developer bisa nambahin nama pekerjaannya apa saja kayak gitu. Nah jadi begitu. Nah nanti dia bakalan nyimpan tuh. Kemudian di janji temu di halaman pasien itu mereka butuh apa saja sih gitu kan.Nah, jadi, di sini ketika pasien itu tambah janji temu, sebenarnya ada kategori layanan ya. Jadi ada tabel layanan, dan itu pun juga nggak boleh hardcoding ya. Jadi bisa diextend lagi. Jadi untuk sekarang itu layanan itu ada dua gitu. Ada layanan umum dan layanan kebidanan. Nah, kalau layanan umum itu isinya ada USG, kemudian pemeriksaan umum, kemudian pengobatan keluhan ringan, kemudian cek tekanan darah, kemudian ECG, kemudian pemeriksaan laboratorium, kemudian nebulizer, kemudian pemeriksaan kehamilan, kemudian konsultasi kesehatan, kemudian surat keterangan kesehatan. Ya gitu. Kemudian kalau layanan bidan, itu ada persalinan, kemudian pemeriksaan kehamilan, kemudian perawatan nifas, kemudian keluarga berencana, kemudian vaginal toilet, kemudian imunisasi, kemudian pemeriksaan tumbuh kembang anak, kemudian konsultasi kesehatan reproduksi. Gitu. Nah, kira-kira begitu. Nah, jadi barulah kemudian dia setelah ngeklik, misalkan ya, contohnya USG. Nah, nanti dia disuruh milih tuh, milih apa namanya, milih semacam informasi, layanan dan keluhan. Ini saya lagi ini ya, maksudnya saya lagi mantau front-end-nya ya, dalam keadaan belum ada, dalam keadaan datanya masih dummy gitu ya. Jadi kita sebagai backend perlu membuatkan infrastrukturnya gitu. Nah, jadi di sini di modal reservasi janji temunya itu setelah milih misalkan USG gitu, kemudian nanti dia disuruh milih ini jenis kunjungannya apa. Nah, jadi jenis kunjungan ini tuh ada dua: pemeriksaan baru dan kontrol ulang. Itu pun datang dari database ya, DB-driven semua gitu. Kemudian nanti ada keluhan atau catatan medisnya apa. Keluhan atau catatan medis itu ya simpel lah, keluhan, udah simpel gitu. Nah, setelah itu, barulah dia nanti akan dibuat semacam ini, apa namanya, semacam antreannya ke berapa, kayak gitu. Jadi yang menentukan antrean itu adalah sistem berdasarkan antrean ya. Nah paradigma antrean itu kan karena si dokter udah ngebuat schedule. Jadi schedule pertama adalah antrean pertama, schedule, kayak gitu. Kan kalau sekarang kan kita lihat kan itu intervalnya 30 menit. Ya udah, simpel. Misalkan contoh ya, ini contoh, ini contoh aja. Misalkan shift pagi gitu. Sebenarnya tuh gini loh, kan satu hari itu kan banyak shift. Nah, ya udah. Kalau dokter itu adanya di... jadi dia berdasarkan schedule aja gitu. Misalkan dokter buat lima schedule. Lima schedule itu, satu ada di pagi hari, misalkan contoh jam 8 sampai jam 8:30, karena 30 menit kan intervalnya. Kemudian di siang hari ada jam 1 sampai jam 1:30. Kemudian di malam hari jam 9 sampai jam 9:30. Kemudian di hari... jam... apa namanya... jam... apa namanya itu... oh, salah-salah. Harusnya... ya itu. Nanti harusnya ya, harusnya. Oke, saya ulang lagi ya. Salah-salah, sorry-sorry. Jadi nanti pasien itu milih sesi pagi kah, mau sesi pagi atau sesi malam atau sesi siang, atau sesi apa gitu. Nah, nanti tuh dia kan ada empat sesi. Nah misalkan pasien itu milih sesi pagi gitu. Nah, itu pun juga harus dicek. Jadi nanti di front-end tuh ada yang ter-disable. Jadi dokter itu, sebuah dokter itu, apa namanya... Jadi nanti dia bakalan dikonektin ke dokter yang ini ya, apa namanya, sesuai dengan polinya gitu, sesuai dengan polinya. Kalau misalkan pasien itu awalnya tadi milih layanan umum, berarti kan poli umum. Nah dia bakalan ngecek dokter yang poli umum. Nah, misalkan contoh dokter X gitu. Dan kebetulan dia adalah poli umum gitu kan, ya udah. Nanti dia bakalan ngecek si dokter ini untuk shift-nya adanya di jam berapa aja. Kalau adanya di empat shift, ya udah. Nanti di front-end nanti sesimpel hidup semua dia, nggak ada yang ter-disable. Nah kalau contoh misalkan si dokter itu ada schedule-nya di dua sesi, pagi dan siang, ya udah selebihnya kena disable, kayak gitu. Kira-kira begitulah kalau di front-end nanti gitu ya. Nah, kemudian contoh misalkan nanti pasien yang melihat, oh pagi udah penuh, atau mungkin siangnya udah penuh, atau... jadi nggak usah bingung lah gitu. Nanti di front-end tuh sesimpel ter-disable aja, nggak usah ada kayak status apa penuh atau segala macam, nggak usah ada, gitu. Jadi backend tuh ngasih simpel aja gitu, simpel. Nggak usah, apa namanya, nggak usah streetpot gitu. Ya kalau penuh ya berarti ter-disable, kalau nggak ada, apa namanya, belum ada dijadwalkan, nah bagaimana, gitu kan. Kalau belum ada dijadwalkan ya tutup juga, apa namanya, bukan tutup ya, ter-disable juga, simpel aja gitu, simpel. Jadi dia memang ngecek gitu loh, ngecek secara efektif schedule-nya apa gitu loh. Misalkan contoh yang ini contoh ya, contoh. Misalkan sesi pagi ada nih kebuka gitu. Nah, pas dia ngeklik, ya udah, dia bakalan ngecek pasien mana, sesuai urutan aja gitu. Kalau misalkan di pagi hari itu kan ada 12 slot ya. 12 slot gitu. Kalau dia... apa namanya... kalau si dokter itu ngebuat jadwalnya itu dari jam 6, ya itu kan dinamis ya. Kalau jam 6, 6 ke 6:30, 6:30 ke 7, jam 7, kemudian jam 7 ke jam 7:30 kan, kayak gitu seterusnya kan ada kiranya 24... eh salah, 24... 12 apa 24? Kayak gitulah pokoknya. Tapi yang jelas segini aja, simpel aja. Jadi logikanya itu berdasarkan si dokter itu buatnya apa, ngebuka jadwalnya itu di jam berapa aja, gitu. Udah simpel gitu loh. Di jam berapa aja, gitu. Misalkan dokter paginya ngebuat 4 gitu, 4 slot. Misalkan jam 6 sampai 7:30 dan seterusnya kayak gitulah pokoknya. Kan memang jam terakhir itu kan nggak ditentukan, karena udah auto interval 30, gitu kan. Nah, ya udah. Katakanlah ada tiga orang pasien yang udah ngebooking dari awal. Ya udah berarti kan pasien baru ini ya ke antrean keempat, simpel aja gitu. Jadi dia bakalan ngecek sekarang tuh antrean keberapa yang terakhir. Misalkan antrean ketiga, berarti pasien baru kan bakalan dapat antrean keempat gitu, simpel. Ya udah. Dan seterusnya dan seterusnya kayak gitu. Kayak gitu sih alurnya, simpel lah begitu.Tapi formulir ini yang dapetin data domisili dan seterusnya tadi, yang dari nama lengkap sampai ke pekerjaan itu tadi, urutannya, itu sebenarnya bakalan ditanyain terus kalau di front-end, gitu loh. Jadi dia per... apa namanya... jadi sistemnya itu gini. Karena kan pasien ini kadang kala dia mau daftarin ininya kan. Jadi dia sistemnya itu agnostik gitu loh. Dia on demand sebenarnya formulir itu ditampilkan, gitu. Misalkan seorang ibu mau daftarin anaknya untuk anu, gitu kan, mau berobat gitu kan. Jadi formulir itu tuh sebenarnya dimintain ketika dia mau buat layanan sebenarnya. Jadi ada dua sih kategorinya, milik dia sendiri. Artinya nanti waktu pengisian layanan itu, apa namanya, waktu sebelum pengisian layanan kan dia diwajibkan untuk mengisi formulir itu kan. Nah itu untuk saya sendiri atau statusnya itu untuk saya sendiri atau ini, atau keluarga gitu. Kayak gitu. Jadi dia sistemnya itu satu orang itu punya hierarkinya lagi. Apa ya namanya ya? Pokoknya kayak gitu lah. Kadang kita mengisi untuk ibu kita atau ayah kita atau anak-anak kita, gitu. Ya pokoknya statusnya kayak gitu. Nah di database bagaimana dia, gitu loh. Di database bagaimana gitu. Nanti kalau sekiranya untuk dia sendiri, nanti kan dia pasti bakalan ini sih milihnya untuk dia sendiri. Nah nanti besok waktu selanjutnya itu waktu anukan layanan, gitu ya. Anukan layanan, maksudnya berlayanan lagi gitu. Karena dia simpelnya kalau untuk dia sendiri kan udah ada datanya di dalam database, jadi nggak perlu ngisi ulang lagi, gitu. Nah tapi ya itu nanti front-end yang ini, yang menentukan untuk diri sendiri apa untuk siapa nih, gitu. Nanti dia bakalan memunculkan data yang pernah dia isi, gitu. Misalkan data mama nya lah, atau data bapaknya lah, atau data siapanya lah. Nanti dia simpelnya nanti di front-end itu ngelist nama anggota keluarganya, gitu mungkin ya. Gitu nama anggota keluarganya. Tapi gini, jangan anggota keluarga juga. Sebenarnya tuh ya dinamis sih, dinamis aja gitu, nggak usah anggota keluarga. Jadi dia by nama aja, nama. Bisa juga dia mau apakan temannya. Jadi nggak usah diverbatimkan, nggak usah di-exactkan, gitu loh. Ya by nama aja. Nama ini terafiliasi dengan si fulan, misalkan gitu. Nanti dia bakalan ini untuk siapa, misalkan untuk Rizki atau untuk siapa. Nah udah langsung masuk, gitu loh. Jadi nggak perlu inputkan ulang lagi, gitu. Jadi kira-kira begitu sistem database-nya bagaimana nanti, gitu kan. Jadi kira-kira begitu. Nah barulah, barulah di sini Anda perbaiki seedernya di database. Seeder di database itu bagaimana, gitu loh. Nah gitu. Jadi NIK yang diambil itu memang sengaja tidak terafiliasi pada autentikasi. Bukan, dia itu NIK. Pokoknya paradigma semuanya ini itu agnostik sebenarnya, gitu.
Saat ini frontend telah mendesain alur pendaftaran layanan dengan paradigma bahwa data pasien dikumpulkan **on-demand**, yaitu ketika pengguna akan membuat atau mendaftarkan suatu layanan. Formulir data pasien tidak ditampilkan sebagai proses wajib setelah autentikasi, melainkan menjadi bagian dari flow sebelum pengguna melanjutkan ke proses layanan.

Dalam flow yang telah didesain oleh tim frontend, pengguna terlebih dahulu menentukan layanan tersebut akan didaftarkan untuk siapa. Identitas tersebut dapat berupa dirinya sendiri maupun individu lain yang ingin didaftarkan melalui akun yang sedang digunakan. Karena itu, konsep ini tidak perlu dibatasi sebagai “anggota keluarga”; sistem cukup memungkinkan pengguna memilih identitas pasien berdasarkan data yang telah tersedia atau membuat data pasien baru ketika identitas tersebut belum tersedia.

Ketika data pasien belum tersedia, frontend akan menampilkan formulir untuk melengkapi informasi pasien sebelum proses layanan dapat dilanjutkan. Data yang dibutuhkan meliputi nama lengkap, NIK, nama ibu kandung, tempat lahir sesuai KTP, tanggal lahir, jenis kelamin, golongan darah, data domisili, dan pekerjaan. Setelah data berhasil disimpan, data tersebut harus dapat digunakan kembali pada proses pendaftaran layanan berikutnya sehingga pengguna tidak perlu mengisi ulang informasi yang sama.

Dengan demikian, kebutuhan tersebut perlu didukung secara langsung oleh **Patient Module pada backend**. Backend perlu menyediakan model data, persistence, API contract, validation, serta relasi yang diperlukan agar frontend dapat menjalankan flow yang telah didesain tanpa membuat atau menyimpan state pasien secara mandiri di sisi frontend.

Backend juga perlu melakukan **schema migration untuk Patient Module** agar struktur database mampu merepresentasikan kebutuhan tersebut secara canonical. Data pasien harus menjadi entitas domain tersendiri dan tidak boleh diperlakukan sebagai sekadar ekstensi dari data autentikasi. Akun yang sedang digunakan hanya menjadi konteks pihak yang melakukan proses pendaftaran, sedangkan identitas pasien tetap dapat digunakan secara independen dalam konteks layanan.

Struktur data juga perlu dipisahkan berdasarkan tanggung jawab domain. Data pasien, domisili, pekerjaan, serta data referensi lain yang memang bersifat reusable harus memiliki representasi yang sesuai pada database. Nilai yang bersifat extensible, seperti daftar pekerjaan dan layanan, tidak boleh ditanamkan sebagai hardcoded value pada frontend. Frontend harus memperoleh data tersebut melalui backend berdasarkan data yang tersedia pada database.

Setelah Patient Module tersedia, backend perlu menyediakan kemampuan bagi frontend untuk melakukan dua kondisi utama: menggunakan kembali pasien yang telah tersimpan sebelumnya atau membuat pasien baru ketika data pasien tersebut belum tersedia. Dengan pendekatan tersebut, frontend cukup menampilkan daftar identitas yang tersedia, memilih pasien yang dituju, dan melanjutkan proses layanan tanpa melakukan duplikasi data pasien.

Implementasi ini menjadi dasar bagi proses appointment berikutnya. Setelah pasien berhasil ditentukan, frontend dapat melanjutkan pemilihan layanan, jenis kunjungan, keluhan atau catatan, sesi pelayanan, hingga proses penentuan antrean. Seluruh data tersebut harus tetap mengikuti sumber kebenaran dari backend dan database, sementara frontend bertanggung jawab terhadap representasi dan interaksi pengguna sesuai flow yang telah dirancang.

Oleh karena itu, pekerjaan backend pada tahap ini bukan sekadar menyesuaikan endpoint terhadap tampilan frontend, tetapi **menyediakan fondasi domain Patient Module beserta schema migration-nya** sehingga flow pendaftaran yang sudah dirancang frontend dapat berjalan menggunakan data nyata, persistent, reusable, dan database-driven.

jadi seeder si schedule perlu di perbaharui biar sync, kemudian buatkan seeder patient  dan data patient form itu juga,  jadi intinya sebelum select layananan dia perlu isi form sesimple itu sih,kemudian nanti di frontendn itu pada halaman janji temu Oke. Jadi kemudian di halaman janji temu di sisi pasien, di web, itu Frontend udah nge-design di halaman pertama janji temu. Itu kan berdasarkan kartu ya. Jadi saya contohin satu kartunya, itu ada komposisi daripada pertama avatar user, kemudian ada, eh sorry, avatarnya si dokter satu. Habis itu ada nama dokternya apa, kemudian dia poli apa, kemudian tanggal schedule-nya, kemudian ruangannya apa, kemudian jam mulainya berapa, kemudian jam selesainya jam berapa, gitu. Kemudian, apa namanya, kemudian kalau di-click detail, itu nanti semuanya bakalan muncul, ditambah emailnya user apa, emailnya pasien, eh salah deh. salah, bukan email. Nama pasiennya apa, keluhannya apa, kemudian ya itulah, terkait data formulir yang di-inputkan sebelumnya, gitu. Detailnya gitu. Sebenarnya isinya itu formulir sebenarnya, formulir yang itu, cuman ya begitu, gitu. Kemudian juga di sini sebenarnya dia bisa nge-reschedule juga ya. Pasien bisa nge-reschedule-kan, gitu. Pasien bisa nge-reschedule-kan, gitu. Nanti pas di-click reschedule untuk schedule terkait, itu dia nanti backend bakalan ngasih jadwal dokter terkait yang kosong apa saja, gitu. Kalau memang sekiranya kosongnya nggak ada, berarti tombol di tombol apa namanya itu, oh sorry, kalau kan gitu. Pas di schedule, otomatis di dalamnya itu list daripada schedule si dokter yang kosong apa saja, gitu. Hanya yang kosong. Nah, jadi perlu dilihat kondisi-kondisinya gitu. Jangan asal ini. Jangan asal ngasih, gitu. Jadi kira-kira itu sih kebutuhan di frontend. Jadi frontend itu nggak perlu ini lagi, kalkulasi dan nge-filter-filter lagi, nggak usah. Simpelnya gitu sih. Jadi semua keperluannya itu udah di-handle backend, kayak gitu.Kemudian mereka, kemudian di sisi alaman pasien itu simpelnya tinggal di-render aja gitu. Mereka nge-consume apa yang kirim oleh backend. design decoupled dan agnostic, serta syntaks tidak boleh lebih dari 500 bari LOC Oh iya, dan juga nanti di front-end itu ada mekanisme pembatalan ya. Di aNah jadi, jadi, apa namanya, jadi di Flutter mobile internal klinik sama admin, pertanyaannya kenapa mereka bisa nge-reschedule kan gitu kan. Sebenarnya itu niat saya itu siapa tahu nih dokternya lagi berhalangan, jadi ada urgency atau apa gitu kan. Itu proyek apa ya, maksudnya ini cerita saya gitu ya. Kan kalau sekarang kan udah ada mekanisme seperti itu dan udah dipasang juga di Flutter dan di web admin udah ada gitu. Jadi nanti ketika internal klinik yang mereschedule kan, itu notifikasi ada di si pasien bahwa misalnya jadwal kamu pada tanggal sekian-sekian-sekian di jam sekian-sekian-sekian dengan layanannya sekian-sekian-sekian itu di-reschedule kan ke jam terbaik. Jadi nanti di pasien itu bisa melihat di halaman dirinya sendiri di-reschedule kan, kayak gitu. Kira-kira begitulah.ksinya itu ada dua, kalau di halaman itu, di halaman janji temu itu ada dua: cancel dan juga reschedule, kayak gitu. Nah, kalau cancel ya, kalau di cancel kan berarti slotnya hidup lagi gitu kan. Artinya jadwal dokter itu hidup lagi gitu. Udah ada sih sebenarnya sekarang, cuman perlu disesuaikan lagi karena requirement yang sekarang tuh nambah lagi gitu kan. Jadi pertama buat dulu modul pasiennya ya, kemudian nanti lakukan pengetesan sesuai end-to-end yang sekarang ini, gitu. Nah, jadi yang terjadi gitu ya, kalau nge-cancel atau reschedule, otomatis di dashboard-nya si admin, gitu ya, di dashboard-nya si admin, harusnya tuh ada ini ya, harusnya ada notifikasi gitu loh, bahwa misalnya pasien X itu sedang mengajukan reschedule gitu atau meng-cancel. Nanti di admin itu, admin atau di Flutter halaman mobile gitu ya. Ya sebenarnya sama aja sih, sama aja sebenarnya. Kalau di internal klinik mereka itu, itu bisa dilihat gitu loh pasien tersebut itu reschedule atau dia nge-cancel, cancel. Nah, jadi kira-kira gitu.gaboleh hardcoging, pakai constant paradigm, cek dto dan seterus nya, kemudian nanti anda buatkan changelog baru ingat baru bukan edit yang lama lakukan test endtoend ketika sudah di rebuild docker nya,