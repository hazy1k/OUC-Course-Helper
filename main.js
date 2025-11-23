(() => {
    // Inject the actual script into the page context to avoid DevTools message channel interruption
    const entry = function () {
      if (window.__AUTO_LEARN_RUNNING__) {
        console.warn("Script is already running, no need to restart.");
        return;
      }
      window.__AUTO_LEARN_RUNNING__ = true;
      window.__AUTO_LEARN_ABORT__ = false;
  
      // ==================== CONFIGURATIONS ====================
      const CONFIG = {
        VIDEO_PLAYBACK_RATE: 1.0,        // Video playback rate
        DEFAULT_WAIT_TIME: 7000,         // Default wait time (ms)
        POLLING_INTERVAL: 1000,          // Polling interval (ms)
        SUB_SECTION_EXPAND_WAIT: 2000,   // Wait time after expanding a sub-section (ms)
        WAIT_AFTER_VIDEO_MS: 60000,      // Extra wait time after video finishes (ms)
        VIDEO_FINISH_THRESHOLD: 0.995,   // Completion threshold (percentage of duration)
        VIDEO_IDLE_TIMEOUT_MS: 45000,    // Timeout for idle progress (stuck detection)
      };
  
      // ==================== HELPER FUNCTIONS ====================
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
      const checkAbort = () => {
        if (window.__AUTO_LEARN_ABORT__) throw new Error("Aborted by user");
      };
  
      const safeClick = (el) => {
        try {
          if (el) {
            // Optimization: Scroll to view before clicking to avoid obstruction
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (el.click) el.click();
          }
        } catch (e) {
          console.warn("Click failed:", e);
        }
      };
  
      // Select the most likely active video (largest visible area)
      function getActiveVideo() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length === 0) return null;
        const scored = videos.map(v => {
          const r = v.getBoundingClientRect();
          const area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0))
                     * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
          return { v, area };
        }).sort((a, b) => b.area - a.area);
        return scored[0].v || videos[0];
      }
  
      // Wait for video to finish (Robust version)
      async function waitForVideoEnd(video) {
        return new Promise(resolve => {
          let finished = false;
          let lastTime = video.currentTime || 0;
          let lastProgressTs = Date.now();
          // Tolerance in seconds
          const epsilon = Math.max(0.8, Math.min(5, 2 / Math.max(0.1, CONFIG.VIDEO_PLAYBACK_RATE)));
  
          const onTimeUpdate = () => {
            const dur = video.duration;
            if (isFinite(dur) && dur > 0) {
              if (video.currentTime / dur >= CONFIG.VIDEO_FINISH_THRESHOLD ||
                  video.currentTime >= dur - epsilon) {
                finished = true;
                cleanup("threshold");
              }
            }
            if (video.currentTime > lastTime + 0.5) {
              lastTime = video.currentTime;
              lastProgressTs = Date.now();
            }
          };
  
          const onEnded = () => {
            finished = true;
            cleanup("ended");
          };
  
          const watchdog = setInterval(() => {
            try {
              checkAbort();
              // If paused externally, try to resume
              if (video.paused && !video.ended) {
                video.play().catch(() => {});
              }
              const dur = video.duration;
              if (isFinite(dur) && dur > 0) {
                if (video.currentTime / dur >= CONFIG.VIDEO_FINISH_THRESHOLD ||
                    video.currentTime >= dur - epsilon) {
                  finished = true;
                  cleanup("threshold/poll");
                }
              }
              // Check for stuck progress
              if (Date.now() - lastProgressTs > CONFIG.VIDEO_IDLE_TIMEOUT_MS) {
                console.warn("Video progress stuck for too long. Treating as stuck/finished to proceed.");
                cleanup("idle-timeout");
              }
            } catch (e) {
              console.warn("Watchdog error:", e);
              cleanup("watchdog-error");
            }
          }, CONFIG.POLLING_INTERVAL);
  
          function cleanup(reason) {
            clearInterval(watchdog);
            video.removeEventListener('ended', onEnded);
            video.removeEventListener('timeupdate', onTimeUpdate);
            resolve({ finished, reason });
          }
  
          video.addEventListener('ended', onEnded);
          video.addEventListener('timeupdate', onTimeUpdate);
        });
      }
  
      async function handleVideo() {
        console.log("Processing video...");
        let video = getActiveVideo();
        if (!video) {
          console.log("No video element found. Waiting default time.");
          await sleep(CONFIG.DEFAULT_WAIT_TIME);
          return;
        }
        try {
          const playBtn = document.querySelector(".mvp-fonts.mvp-fonts-play");
          if (playBtn) safeClick(playBtn);
  
          // Set playback parameters and attempt to play
          video.playbackRate = CONFIG.VIDEO_PLAYBACK_RATE;
          // Optimization: Ensure muted to bypass browser autoplay policies
          video.muted = true;
          video.volume = 0;
          
          await video.play().catch(e => console.error("Video play failed (browser restriction?):", e));
        } catch (e) {
          console.warn("Error attempting to play video:", e);
        }
  
        // Robust wait for video end
        const { finished, reason } = await waitForVideoEnd(video);
        console.log("Video finished waiting:", { finished, reason });
  
        // Only wait extra time if video actually finished
        if (finished && CONFIG.WAIT_AFTER_VIDEO_MS > 0) {
          const secs = Math.round(CONFIG.WAIT_AFTER_VIDEO_MS / 1000);
          console.log(`Video ended. Waiting extra ${secs} seconds before switching...`);
          await sleep(CONFIG.WAIT_AFTER_VIDEO_MS);
        }
      }
  
      async function handleMaterial() {
        console.log("Processing material...");
        const viewButtons = document.querySelectorAll('.ivu-table-cell .ng-scope');
        if (viewButtons.length === 0) {
          console.log("'View' button not found. Waiting default time.");
          await sleep(CONFIG.DEFAULT_WAIT_TIME);
          return;
        }
        for (const button of viewButtons) {
          checkAbort();
          if (button.textContent.includes('查看') || button.textContent.includes('View')) {
            console.log("Clicking 'View' button...");
            safeClick(button);
            await sleep(CONFIG.DEFAULT_WAIT_TIME);
            const closeBtn = document.querySelector('#file-previewer > div > div > div.header.clearfix > a');
            if (closeBtn) {
              console.log("Closing preview window...");
              safeClick(closeBtn);
            }
            await sleep(2000);
          }
        }
        console.log("All materials processed.");
      }
  
      async function handlePage() {
        console.log("Processing normal page, waiting...");
        await sleep(CONFIG.DEFAULT_WAIT_TIME);
      }
  
      async function processItems(items, startIndex = 0) {
        for (let i = startIndex; i < items.length; i++) {
          checkAbort();
          const item = items[i];
          if (!item) continue;
          const titleEl = item.querySelector('.full-screen-mode-sidebar-menu-item-title');
          const titleText = titleEl ? titleEl.textContent.trim() : `Item ${i + 1}`;
  
          console.log(`--- Starting Item: "${titleText}" ---`);
          safeClick(item);
          await sleep(CONFIG.DEFAULT_WAIT_TIME);
  
          const icon = item.querySelector('i');
          if (icon) {
            if (icon.classList.contains('font-syllabus-online-video')) {
              await handleVideo();
            } else if (icon.classList.contains('font-syllabus-material')) {
              await handleMaterial();
            } else if (icon.classList.contains('font-syllabus-page')) {
              await handlePage();
            } else {
              console.log("Unknown item type. Using default wait.");
              await handlePage();
            }
          } else {
            console.log("No icon found. Using default wait.");
            await handlePage();
          }
        }
        console.log("All items in this section processed.");
      }
  
      async function startAutomation() {
        console.log("Script started. Automating all sections...");
        const allSections = document.querySelectorAll('.full-screen-mode-sidebar-menu > .full-screen-mode-sidebar-sub-menu');
        if (allSections.length === 0) {
          console.error("Error: No sections found! Check selectors or ensure console frame matches the sidebar iframe.");
          return;
        }
  
        console.log(`Found ${allSections.length} sections in total.`);
  
        let startSectionIndex = 0;
        let startItemIndex = 0;
        const activeItem = document.querySelector('.full-screen-mode-sidebar-menu-item.active');
  
        if (activeItem) {
          const currentSection = activeItem.closest('.full-screen-mode-sidebar-menu > .full-screen-mode-sidebar-sub-menu');
          if (currentSection) {
            startSectionIndex = Array.from(allSections).indexOf(currentSection);
            const itemsInCurrentSection = currentSection.querySelectorAll('.full-screen-mode-sidebar-menu-item');
            startItemIndex = Array.from(itemsInCurrentSection).indexOf(activeItem);
            console.log(`Detected active item. Resuming from Section ${startSectionIndex + 1}, Item ${startItemIndex + 1}.`);
          }
        } else {
          console.log("No active item detected. Starting from the first item of the first section.");
        }
  
        for (let i = startSectionIndex; i < allSections.length; i++) {
          checkAbort();
          const section = allSections[i];
          if (!section) continue;
  
          const sectionTitle = section.querySelector(':scope > .full-screen-mode-sidebar-sub-menu-title');
          const isStartingChapter = (i === startSectionIndex && !!activeItem);
  
          if (sectionTitle) {
            const sectionTitleText = sectionTitle.textContent.trim();
            console.log(`\n========================================\nProcessing Section (${i + 1}/${allSections.length}): ${sectionTitleText}\n========================================`);
            if (!isStartingChapter) {
              safeClick(sectionTitle);
              await sleep(CONFIG.DEFAULT_WAIT_TIME);
            } else {
              console.log("This is the current active section. Processing internal items directly.");
            }
          }
  
          // Smartly expand sub-sections
          const subSections = section.querySelectorAll(':scope > div > .full-screen-mode-sidebar-sub-menu');
          if (subSections.length > 0) {
            console.log(`Detected ${subSections.length} sub-sections. Expanding...`);
            for (const subSection of subSections) {
              checkAbort();
              const subSectionTitle = subSection.querySelector(':scope > .full-screen-mode-sidebar-sub-menu-title');
              const shouldClickSubSection = !isStartingChapter || (isStartingChapter && !subSection.contains(activeItem));
              
              if (shouldClickSubSection && subSectionTitle) {
                console.log(`Expanding sub-section: ${subSectionTitle.textContent.trim()}`);
                safeClick(subSectionTitle);
                await sleep(CONFIG.SUB_SECTION_EXPAND_WAIT);
              } else if (subSectionTitle) {
                console.log(`Skipping click on currently active sub-section: ${subSectionTitle.textContent.trim()}`);
              }
            }
            console.log("Sub-sections expansion complete.");
          }
  
          const items = section.querySelectorAll('.full-screen-mode-sidebar-menu-item');
          if (items.length > 0) {
            const currentStartIndex = isStartingChapter ? startItemIndex : 0;
            await processItems(items, currentStartIndex);
          } else {
            console.log("No learnable items found in this section. Skipping.");
          }
        }
        console.log("\n🎉🎉🎉 Congratulations! All tasks in all sections are complete! 🎉🎉🎉");
      }
  
      // Global stop function
      window.stopAutoLearn = () => {
        window.__AUTO_LEARN_ABORT__ = true;
        console.warn("Stop requested. Will exit after current step completes.");
      };
  
      // Start
      (async () => {
        try {
          await startAutomation();
        } catch (e) {
          console.error("Runtime error:", e);
        } finally {
          window.__AUTO_LEARN_RUNNING__ = false;
        }
      })();
    };
  
    const s = document.createElement('script');
    s.textContent = `;(${entry.toString()})();`;
    document.documentElement.appendChild(s);
    s.remove();
  })();
  