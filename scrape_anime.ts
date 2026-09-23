import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function run() {
  const maxPages = parseInt(process.argv[2] || '1', 10);
  console.log(`Khởi động trình duyệt... (Sẽ scrape ${maxPages} trang)`);
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

  const jsonFile = path.join(__dirname, 'anime_data.json');
  let allData = [];
  if (fs.existsSync(jsonFile)) {
     try {
       allData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
     } catch(e) {
       allData = [];
     }
  } else {
     fs.writeFileSync(jsonFile, '[]');
  }
  
  try {
    for (let p = 1; p <= maxPages; p++) {
      const targetDomain = `https://animevietsub.li/anime-moi/trang-${p}.html`;
      console.log(`\n========================================`);
      console.log(`Đang truy cập Trang ${p}: ${targetDomain}...`);
      
      await page.goto(targetDomain, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await page.waitForSelector('.TPostMv, .TPost, article', { timeout: 30000 }).catch(() => {});
      
      console.log('Đang lấy danh sách anime...');
      const animes = await page.evaluate(function() {
        var items = Array.from(document.querySelectorAll('.TPostMv, .TPost, article'));
        var result = [];
        for (var i = 0; i < items.length; i++) {
          var a = items[i].querySelector('a');
          if (!a && items[i].tagName.toLowerCase() === 'a') {
              a = items[i];
          }
          if (a) {
              var title = a.getAttribute('title') || a.innerText || '';
              var url = a.href || '';
              if (title && url) {
                  result.push({ name: title.trim(), url: url });
              }
          }
          // Bỏ giới hạn lấy 5 anime, bây giờ sẽ lấy toàn bộ anime trên trang
        }
        return result;
      });

      console.log(`Đã tìm thấy ${animes.length} anime ở Trang ${p}. Bắt đầu lấy link từng tập...`);
      
      for (const anime of animes) {
        // Kiểm tra xem anime đã tồn tại trong allData chưa, nếu có thì skip để tiết kiệm thời gian (tùy chọn)
        // Hiện tại cứ cào lại để cập nhật tập mới
        console.log(`\n[Trang ${p}] Đang xử lý Anime: ${anime.name} - ${anime.url}`);
        try {
          await page.goto(anime.url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
          await page.waitForSelector('#MvTb-Info', { timeout: 30000 }).catch(() => {});
          
          console.log(`Đang thu thập thông tin chi tiết cho ${anime.name}...`);
          const details = await page.evaluate(function() {
            var infoEl = document.querySelector('#MvTb-Info');
            var info = infoEl ? (infoEl.innerText || '').trim() : '';
            
            var castEls = document.querySelectorAll('#MvTb-Cast figcaption');
            var castArray = [];
            for (var i = 0; i < castEls.length; i++) {
                castArray.push((castEls[i].innerText || '').trim());
            }
            var castEl = document.querySelector('#MvTb-Cast');
            var cast = castArray.join(', ') || (castEl ? (castEl.innerText || '').trim() : '');
            
            var trailerEl = document.querySelector('#MvTb-Trailer iframe');
            var trailerTabEl = document.querySelector('#MvTb-Trailer');
            var trailer = trailerEl ? trailerEl.src : (trailerTabEl ? (trailerTabEl.innerText || '').trim() : '');
            
            var imageEls = document.querySelectorAll('#MvTb-Image img');
            var imgArray = [];
            for (var j = 0; j < imageEls.length; j++) {
                imgArray.push(imageEls[j].src);
            }
            var images = imgArray.join(', ');
            
            return { info: info, cast: cast, trailer: trailer, images: images };
          });
          
          let animeRecord = {
             name: anime.name,
             url: anime.url,
             info: details.info,
             cast: details.cast,
             trailer: details.trailer,
             images: details.images,
             episodes: []
          };
          console.log(`=> Đã lấy thông tin chi tiết.`);
          
          const watchHref = await page.evaluate(function() {
            var btn = document.querySelector('.btn-see, .button-watch, a[href*="xem-phim"]');
            return btn ? btn.href : '';
          });
          
          if (!watchHref) {
            console.log(`Không tìm thấy nút Xem phim cho ${anime.name}`);
            // Dù không có tập nào thì vẫn lưu thông tin phim
            allData.push(animeRecord);
            fs.writeFileSync(jsonFile, JSON.stringify(allData, null, 2));
            continue;
          }

          console.log(`=> Truy cập trang xem phim: ${watchHref}`);
          await page.goto(watchHref, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
          await page.waitForSelector('.list-item-episode a, .episode a, .server-item a, ul.list-episode li a, .list-episode a, .halim-list-eps a', { timeout: 15000 }).catch(() => {});
          
          const episodes = await page.evaluate(function() {
            var eps = Array.from(document.querySelectorAll('.list-item-episode a, .episode a, .server-item a, ul.list-episode li a, .list-episode a, .halim-list-eps a'));
            var result = [];
            for (var i = 0; i < eps.length; i++) {
                result.push({
                    title: (eps[i].innerText || '').trim(),
                    url: eps[i].href
                });
            }
            return result;
          });

          if (episodes.length === 0) {
            console.log(`Không tìm thấy danh sách tập phim nào.`);
          } else {
            console.log(`Tìm thấy ${episodes.length} tập phim. Bắt đầu thu thập link...`);
            for (const ep of episodes) {
              console.log(`  -> Đang lấy link Tập ${ep.title}...`);
              try {
                await page.goto(ep.url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
                
                await page.waitForSelector('iframe', { timeout: 5000 }).catch(() => {});
                
                let videoLink = await page.evaluate(function() {
                  var iframe = document.querySelector('iframe');
                  if (iframe) return iframe.src;
                  var video = document.querySelector('video source');
                  if (video) return video.src;
                  return 'N/A';
                });
                
                animeRecord.episodes.push({
                    title: ep.title,
                    url: ep.url,
                    videoLink: videoLink
                });
                
              } catch (epErr) {
                console.error(`  [Lỗi] Không thể tải Tập ${ep.title}: ${epErr.message}`);
              }
            }
          }
          
          // Kiểm tra xem phim này đã có trong allData chưa để cập nhật hoặc thêm mới
          let existingIndex = allData.findIndex(a => a.url === animeRecord.url);
          if (existingIndex !== -1) {
              allData[existingIndex] = animeRecord; // Ghi đè cập nhật
          } else {
              allData.push(animeRecord);
          }
          
          fs.writeFileSync(jsonFile, JSON.stringify(allData, null, 2));
          
        } catch (err) {
          console.error(`Lỗi khi xử lý ${anime.name}: ${err.message}`);
        }
      }
    }
    
    console.log(`\nHoàn thành! Toàn bộ dữ liệu đã được lưu thành công vào ${jsonFile}`);
    
  } catch (err) {
    console.error('Đã xảy ra lỗi trong quá trình chạy:', err);
  } finally {
    await browser.close();
  }
}

run();
