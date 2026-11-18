<template>
  <div class="tmb-pane" data-testid="tmb-strategy">
    <div v-if="!detail" style="display: grid; gap: 10px"><div class="tmb-skel" style="height: 120px"></div><div class="tmb-skel" style="height: 220px"></div></div>
    <template v-else>
      <div v-if="!detail.Blog.Autopilot" class="tmb-note" data-tone="info">
        <TumblrIcon name="info" />
        <div style="flex: 1"><strong>Autopilot is off for @{{ detail.Blog.Name }}.</strong> Only posts you compose go out. Check the plan below, then switch it on in the blog list.</div>
      </div>

      <!-- at a glance -->
      <div class="tmb-minikpis">
        <div class="tmb-minikpi"><b>{{ draft.Slots.length }}</b><span>posts a week · {{ draft.TimeZone }}</span></div>
        <div class="tmb-minikpi" :title="runwayTitle">
          <b :class="{ 'tmb-neg': runwayWeeks != null && runwayWeeks < 2 }">{{ detail.Runway.Error ? '!' : fmtCount(detail.Runway.Eligible ?? 0) }}</b>
          <span>{{ detail.Runway.Error ? detail.Runway.Error : runwayWeeks != null ? `unused items · about ${runwayWeeks} weeks` : 'unused items' }}</span>
        </div>
        <div class="tmb-minikpi"><b>{{ detail.Blog.UsedContentCount }}</b><span>items used · {{ detail.Blog.RejectedContentCount }} turned down</span></div>
        <div class="tmb-minikpi"><b>{{ CAPTION_MODES.find(m => m.value === draft.CaptionMode)?.label }}</b><span>captions{{ draft.CaptionMode === 'AI' && draft.Ai.UseVision ? ' · looks at the video' : '' }}</span></div>
      </div>

      <div v-if="detail.Runway.Next?.length" class="tmb-panel">
        <div class="tmb-panel__title"><TumblrIcon name="layers" />Next in line<small>the order autopilot will use them</small></div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px">
          <a v-for="c in detail.Runway.Next.slice(0, 12)" :key="c.Key" :href="c.OriginalUrl ?? undefined" target="_blank" rel="noopener noreferrer"
             :title="`${c.Origin ? '@' + c.Origin + ' · ' : ''}${c.Views ? fmtCount(c.Views) + ' views · ' : ''}${c.OriginalCaption ?? c.FileName}`">
            <TumblrThumb size="fill" :kind="c.Kind" :path="contentThumbPath(blogId, c.Key)" :badge="c.DurationSeconds ? fmtClipLength(c.DurationSeconds) : null" />
          </a>
        </div>
      </div>

      <!-- when -->
      <section class="tmb-panel">
        <div class="tmb-panel__title"><TumblrIcon name="calendar" />When to post<small>autopilot fills each slot ahead of time</small></div>
        <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 10px">
          <div class="tmb-field" style="min-width: 240px">
            <label for="tmb-tz">Time zone</label>
            <select id="tmb-tz" v-model="draft.TimeZone" class="tmb-select" :disabled="!canEdit">
              <option v-if="!zones.includes(draft.TimeZone)" :value="draft.TimeZone">{{ draft.TimeZone }}</option>
              <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
            </select>
          </div>
          <div class="tmb-field">
            <span class="tmb-label">Quick start</span>
            <div class="tmb-seg" role="group" aria-label="Schedule presets">
              <button v-for="p in PRESETS" :key="p.label" class="tmb-seg__opt" :disabled="!canEdit" @click="setSlots(p.slots)">{{ p.label }}</button>
            </div>
          </div>
        </div>
        <div class="tmb-week" role="table" aria-label="Weekly posting times">
          <div v-for="day in WEEK_ORDER" :key="day" class="tmb-week__day" role="row">
            <span class="tmb-week__name" role="rowheader">{{ DAY_SHORT[day] }}</span>
            <div class="tmb-week__times" role="cell">
              <span v-for="s in slotsFor(day)" :key="s.Minute" class="tmb-time">{{ minuteToHHMM(s.Minute) }}
                <button v-if="canEdit" type="button" :aria-label="`Remove ${DAY_LONG[day]} ${minuteToHHMM(s.Minute)}`" @click="removeSlot(day, s.Minute)"><TumblrIcon name="x" /></button>
              </span>
              <span v-if="!slotsFor(day).length" class="tmb-faint">—</span>
            </div>
            <div v-if="canEdit" class="tmb-week__add" role="cell">
              <input v-model="times[day]" type="time" class="tmb-input" :aria-label="`Add a time on ${DAY_LONG[day]}`" @keydown.enter.prevent="addSlot(day)" />
              <button type="button" class="tmb-btn tmb-btn--xs" :disabled="!times[day]" @click="addSlot(day)">Add</button>
              <button v-if="slotsFor(day).length" type="button" class="tmb-btn tmb-btn--xs tmb-btn--ghost" title="Use these times every day" @click="copyToAll(day)">→ all</button>
            </div>
          </div>
        </div>
        <details style="margin-top: 10px">
          <summary class="tmb-dim" style="cursor: pointer; font-size: 12.5px">Timing rules</summary>
          <div class="tmb-grid4" style="margin-top: 10px">
            <div class="tmb-field"><label for="tmb-ahead">Prepare ahead (days)</label><input id="tmb-ahead" v-model.number="draft.PlanAheadDays" type="number" min="1" max="30" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-jitter">Jitter (± min)</label><input id="tmb-jitter" v-model.number="draft.JitterMinutes" type="number" min="0" max="120" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-maxday">Max posts a day</label><input id="tmb-maxday" v-model.number="draft.MaxPostsPerDay" type="number" min="1" max="250" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-gap">Min gap (min)</label><input id="tmb-gap" v-model.number="draft.MinGapMinutes" type="number" min="0" max="1440" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-missed">A missed slot</label>
              <select id="tmb-missed" v-model="draft.MissedSlots" class="tmb-select" :disabled="!canEdit"><option value="PublishLate">Publish late, within grace</option><option value="Skip">Skip it</option></select></div>
            <div class="tmb-field"><label for="tmb-grace">Grace (hours)</label><input id="tmb-grace" v-model.number="draft.MissedSlotGraceHours" type="number" min="0" max="72" class="tmb-input" :disabled="!canEdit || draft.MissedSlots === 'Skip'" /></div>
          </div>
        </details>
      </section>

      <div class="tmb-cols">
        <!-- what -->
        <section class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="video" />What to post<small>each item once per blog</small></div>
          <div class="tmb-seg" role="group" aria-label="Content source">
            <button v-for="s in SOURCES" :key="s.value" class="tmb-seg__opt" :aria-pressed="draft.Source === s.value" :disabled="!canEdit" @click="draft.Source = s.value">{{ s.label }}</button>
          </div>
          <p class="tmb-help" style="margin: 8px 0">{{ SOURCES.find(s => s.value === draft.Source)?.help }}</p>
          <template v-if="draft.Source === 'MemeScraper'">
            <div v-if="catalog && !catalog.Ready" class="tmb-note" data-tone="warn"><TumblrIcon name="clock" /><div>MemeScraper is still loading its reels.</div></div>
            <div class="tmb-field" style="margin-bottom: 10px">
              <span class="tmb-label">Niches <span class="tmb-faint">(none = every niche)</span></span>
              <div class="tmb-chips">
                <button v-for="n in catalog?.Niches ?? []" :key="n.Name" class="tmb-pick" :aria-pressed="hasNiche(n.Name)" :disabled="!canEdit" @click="toggleNiche(n.Name)">{{ n.Name }} <small>{{ fmtCount(n.Reels) }}</small></button>
                <span v-if="!catalog" class="tmb-faint">Loading…</span>
              </div>
            </div>
            <div class="tmb-field" style="margin-bottom: 10px">
              <label for="tmb-sources">Only these Instagram accounts</label>
              <TumblrTagBox v-model="draft.MemeScraper.Sources" input-id="tmb-sources" prefix="@" placeholder="Any account (type to narrow it down)" label="Source accounts" :disabled="!canEdit" />
              <div v-if="sourceSuggestions.length && canEdit" class="tmb-chips" style="margin-top: 4px">
                <button v-for="s in sourceSuggestions" :key="s.Username" class="tmb-pick" @click="draft.MemeScraper.Sources = [...draft.MemeScraper.Sources, s.Username]">@{{ s.Username }} <small>{{ s.Reels }}</small></button>
              </div>
            </div>
            <div class="tmb-grid4">
              <div class="tmb-field"><label for="tmb-pick">Pick</label>
                <select id="tmb-pick" v-model="draft.MemeScraper.Pick" class="tmb-select" :disabled="!canEdit">
                  <option value="Best">Best (views, likes, freshness)</option><option value="Newest">Newest</option><option value="Random">Random</option><option value="Oldest">Oldest</option>
                </select></div>
              <div class="tmb-field"><label for="tmb-age">Max age (days, 0 = any)</label><input id="tmb-age" v-model.number="draft.MemeScraper.MaxAgeDays" type="number" min="0" class="tmb-input" :disabled="!canEdit" /></div>
              <div class="tmb-field"><label for="tmb-views">Min views</label><input id="tmb-views" v-model.number="draft.MemeScraper.MinViews" type="number" min="0" class="tmb-input" :disabled="!canEdit" /></div>
              <div class="tmb-field"><label for="tmb-len">Max length (s)</label><input id="tmb-len" v-model.number="draft.MemeScraper.MaxDurationSeconds" type="number" min="0" max="3600" class="tmb-input" :disabled="!canEdit" /></div>
            </div>
            <label class="tmb-check" style="margin-top: 10px"><input v-model="draft.MemeScraper.AllowReuseAcrossBlogs" type="checkbox" :disabled="!canEdit" />Let the other blogs post the same reels</label>
          </template>
          <template v-else-if="draft.Source === 'Folder'">
            <div class="tmb-grid2">
              <div class="tmb-field"><label for="tmb-folder">Folder on the server</label><input id="tmb-folder" v-model="draft.Folder.Path" class="tmb-input tmb-mono" placeholder="D:\Content\memes" :disabled="!canEdit" /></div>
              <div class="tmb-field"><label for="tmb-fpick">Pick</label>
                <select id="tmb-fpick" v-model="draft.Folder.Pick" class="tmb-select" :disabled="!canEdit"><option value="Random">Random</option><option value="Newest">Newest file first</option><option value="Oldest">Oldest file first</option></select></div>
            </div>
            <div class="tmb-chips" style="margin-top: 10px; gap: 16px">
              <label class="tmb-check"><input v-model="draft.Folder.Videos" type="checkbox" :disabled="!canEdit" />Videos</label>
              <label class="tmb-check"><input v-model="draft.Folder.Images" type="checkbox" :disabled="!canEdit" />Images</label>
              <label class="tmb-check"><input v-model="draft.Folder.IncludeSubfolders" type="checkbox" :disabled="!canEdit" />Subfolders</label>
            </div>
          </template>
          <template v-else-if="draft.Source === 'Library'">
            <div class="tmb-drop" :data-over="dragging || undefined" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
              Drop videos or images here, or <button type="button" class="tmb-link-btn" :disabled="!canUpload" @click="picker?.click()">choose files</button>. Autopilot posts them oldest first, each once.
              <input ref="picker" type="file" multiple hidden accept="video/mp4,video/quicktime,.m4v,image/jpeg,image/png,image/gif,image/webp" @change="onPick" />
            </div>
            <ul v-if="uploads.length" class="tmb-feed" style="margin-top: 8px">
              <li v-for="u in uploads" :key="u.id" style="grid-template-columns: minmax(0, 1fr) auto">
                <span class="tmb-truncate">{{ u.name }}</span>
                <span :class="u.error ? 'tmb-neg' : u.done ? 'tmb-pos' : 'tmb-dim'">{{ u.error ?? (u.done ? 'uploaded' : `${u.percent}%`) }}</span>
              </li>
            </ul>
            <div v-if="library.length" class="tmb-tablewrap" style="margin-top: 8px">
              <table class="tmb-table">
                <tbody>
                  <tr v-for="f in library" :key="f.FileName">
                    <td class="tmb-mono tmb-truncate" style="max-width: 240px">{{ f.FileName }}</td>
                    <td class="tmb-dim">{{ f.Kind }}</td>
                    <td class="num tmb-dim">{{ fmtBytes(f.Bytes) }}</td>
                    <td><span class="tmb-chip" :data-tone="f.Used ? 'neutral' : 'ok'">{{ f.Used ? 'used' : 'waiting' }}</span></td>
                    <td class="num"><button v-if="canDelete" class="tmb-btn tmb-btn--xs tmb-btn--ghost" @click="deleteFile(f.FileName)">Delete</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="tmb-help" style="margin-top: 8px">The library is empty.</p>
          </template>
        </section>

        <!-- tags -->
        <section class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="tag" />Tags<small>how people find posts</small></div>
          <div class="tmb-field" style="margin-bottom: 10px"><label for="tmb-fixed">Always</label><TumblrTagBox v-model="draft.FixedTags" input-id="tmb-fixed" label="Fixed tags" :disabled="!canEdit" /></div>
          <div class="tmb-field" style="margin-bottom: 10px"><label for="tmb-rot">Rotating pool</label><TumblrTagBox v-model="draft.RotatingTags" input-id="tmb-rot" label="Rotating tags" :disabled="!canEdit" /></div>
          <div class="tmb-grid2">
            <div class="tmb-field"><label for="tmb-rotn">Rotating tags a post</label><input id="tmb-rotn" v-model.number="draft.RotatingTagsPerPost" type="number" min="0" max="30" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-maxtags">Max tags a post</label><input id="tmb-maxtags" v-model.number="draft.MaxTags" type="number" min="1" max="30" class="tmb-input" :disabled="!canEdit" />
              <span class="tmb-help">Tumblr lists a post under its first 20.</span></div>
          </div>
          <label class="tmb-check" style="margin-top: 10px"><input v-model="draft.ResearchTags" type="checkbox" :disabled="!canEdit" />Check the caption model's tags on Tumblr and keep only ones other people's posts get notes under</label>
        </section>
      </div>

      <!-- captions -->
      <section class="tmb-panel">
        <div class="tmb-panel__title"><TumblrIcon name="sparkles" />Captions<small>written when a post is planned, so they can be read first</small></div>
        <div class="tmb-seg" role="group" aria-label="Caption style">
          <button v-for="m in CAPTION_MODES" :key="m.value" class="tmb-seg__opt" :aria-pressed="draft.CaptionMode === m.value" :disabled="!canEdit" @click="draft.CaptionMode = m.value">{{ m.label }}</button>
        </div>
        <p class="tmb-help" style="margin: 8px 0">{{ CAPTION_MODES.find(m => m.value === draft.CaptionMode)?.help }}</p>
        <template v-if="draft.CaptionMode === 'AI'">
          <div class="tmb-grid2">
            <div class="tmb-field"><label for="tmb-persona">Voice</label><textarea id="tmb-persona" v-model="draft.Ai.Persona" rows="3" class="tmb-textarea" :disabled="!canEdit"></textarea></div>
            <div class="tmb-field"><label for="tmb-instr">Extra instructions</label><textarea id="tmb-instr" v-model="draft.Ai.Instructions" rows="3" class="tmb-textarea" placeholder="lowercase only; no puns" :disabled="!canEdit"></textarea></div>
          </div>
          <div class="tmb-field" style="margin-top: 10px"><label for="tmb-examples">Example captions, one a line (imitated, never reused)</label><textarea id="tmb-examples" v-model="examplesText" rows="3" class="tmb-textarea" :disabled="!canEdit"></textarea></div>
          <div class="tmb-grid4" style="margin-top: 10px">
            <div class="tmb-field"><label for="tmb-maxlen">Max length</label><input id="tmb-maxlen" v-model.number="draft.Ai.MaxLength" type="number" min="20" max="2000" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-lang">Language</label><input id="tmb-lang" v-model="draft.Ai.Language" class="tmb-input" :disabled="!canEdit" /></div>
            <div class="tmb-field"><label for="tmb-fallback">If the AI fails</label>
              <select id="tmb-fallback" v-model="draft.Ai.Fallback" class="tmb-select" :disabled="!canEdit"><option value="Empty">Post without a caption</option><option value="Fixed">Use the fixed caption</option><option value="Hold">Hold the post</option></select></div>
            <div class="tmb-field"><label for="tmb-model">Model override</label><input id="tmb-model" v-model="modelText" class="tmb-input tmb-mono" placeholder="KliveLLM default" :disabled="!canEdit" /></div>
          </div>
          <div class="tmb-chips" style="margin-top: 10px; gap: 16px">
            <label class="tmb-check"><input v-model="draft.Ai.UseVision" type="checkbox" :disabled="!canEdit" />Look at the video</label>
            <label class="tmb-check"><input v-model="draft.Ai.UseSourceCaption" type="checkbox" :disabled="!canEdit" />Use the original caption as context</label>
            <label class="tmb-check"><input v-model="draft.Ai.SuggestTags" type="checkbox" :disabled="!canEdit" />Suggest up to <input v-model.number="draft.Ai.MaxSuggestedTags" type="number" min="0" max="15" class="tmb-input tmb-input--tiny" aria-label="Most suggested tags" :disabled="!canEdit || !draft.Ai.SuggestTags" /> tags</label>
            <label class="tmb-check"><input v-model="draft.Ai.AllowEmoji" type="checkbox" :disabled="!canEdit" />Emoji</label>
          </div>
        </template>
        <div v-if="draft.CaptionMode === 'Fixed' || (draft.CaptionMode === 'AI' && draft.Ai.Fallback === 'Fixed')" class="tmb-field" style="margin-top: 10px">
          <label for="tmb-fixedcap">Fixed caption</label><textarea id="tmb-fixedcap" v-model="draft.FixedCaption" rows="2" class="tmb-textarea" :disabled="!canEdit"></textarea>
        </div>
        <div v-if="draft.CaptionMode === 'Rotate'" class="tmb-field" style="margin-top: 10px">
          <label for="tmb-pool">Caption pool, one a line, used in turn</label><textarea id="tmb-pool" v-model="poolText" rows="5" class="tmb-textarea" :disabled="!canEdit"></textarea>
        </div>
        <div v-if="draft.CaptionMode === 'AI' && canEdit" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--tmb-line); display: grid; gap: 8px">
          <div style="display: flex; gap: 8px">
            <input v-model="previewDirection" class="tmb-input" placeholder="Optional direction for this test" aria-label="Direction for the test caption" />
            <button class="tmb-btn" :disabled="previewing" data-testid="tmb-try-caption" @click="preview"><TumblrIcon :name="previewing ? 'refresh' : 'wand'" :class="{ 'tmb-spin': previewing }" />{{ previewing ? 'Writing…' : 'Try it on the next video' }}</button>
          </div>
          <p v-if="previewError" class="tmb-error">{{ previewError }}</p>
          <div v-if="previewResult" class="tmb-panel" style="display: flex; gap: 12px; background: var(--tmb-surface-2)">
            <TumblrThumb size="md" :kind="previewResult.Content.Kind" :path="contentThumbPath(blogId, previewResult.Content.Key)" />
            <div style="min-width: 0; display: grid; gap: 4px; align-content: start">
              <p style="font-size: 15px">{{ previewResult.Caption }}</p>
              <p class="tmb-row__tags"><span v-for="t in previewResult.Tags" :key="t" class="tmb-tag">#{{ t }}</span></p>
              <p v-if="previewResult.DroppedTags?.length" class="tmb-help">Left out, nobody else uses them: {{ previewResult.DroppedTags.map(t => '#' + t).join(' ') }}</p>
              <p class="tmb-help">{{ previewResult.UsedVision ? `Looked at ${previewResult.FramesSent} frames` : 'Text only' }} · {{ previewResult.Model ?? 'default model' }}{{ previewResult.Content.Origin ? ` · @${previewResult.Content.Origin}` : '' }}</p>
            </div>
          </div>
          <p class="tmb-help">Tests use the settings on screen, saved or not, and create no post.</p>
        </div>
      </section>

      <div class="tmb-cols">
        <!-- reblogs -->
        <section class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="reblog" />Curated reblogs<small>{{ draft.Reblogs.Enabled ? `${draft.Reblogs.PerDay} a day` : 'off' }}</small></div>
          <p class="tmb-help" style="margin-bottom: 8px">A few times a day, reblog a well-liked original post from the blog's tags. Every pick is screened, and one the model couldn't look at always waits for approval. Needs autopilot.</p>
          <div class="tmb-chips" style="gap: 16px">
            <label class="tmb-check"><input v-model="draft.Reblogs.Enabled" type="checkbox" :disabled="!canEdit" />Reblog other people's posts</label>
            <label class="tmb-check"><input v-model="draft.Reblogs.RequireApproval" type="checkbox" :disabled="!canEdit || !draft.Reblogs.Enabled" />Hold each pick for approval</label>
          </div>
          <template v-if="draft.Reblogs.Enabled">
            <div class="tmb-grid4" style="margin-top: 10px">
              <div class="tmb-field"><label for="tmb-rpd">A day</label><input id="tmb-rpd" v-model.number="draft.Reblogs.PerDay" type="number" min="1" max="12" class="tmb-input" :disabled="!canEdit" /></div>
              <div class="tmb-field"><label for="tmb-rmin">At least (notes)</label><input id="tmb-rmin" v-model.number="draft.Reblogs.MinNotes" type="number" min="0" class="tmb-input" :disabled="!canEdit" /></div>
              <div class="tmb-field"><label for="tmb-rage">No older than (h)</label><input id="tmb-rage" v-model.number="draft.Reblogs.MaxAgeHours" type="number" min="6" max="336" class="tmb-input" :disabled="!canEdit" /></div>
              <div class="tmb-field"><label for="tmb-rfrom">Between hours</label>
                <div style="display: flex; gap: 6px; align-items: center"><input id="tmb-rfrom" v-model.number="draft.Reblogs.StartHour" type="number" min="0" max="23" class="tmb-input" :disabled="!canEdit" /><span class="tmb-dim">–</span><input v-model.number="draft.Reblogs.EndHour" type="number" min="1" max="24" class="tmb-input" aria-label="Last hour" :disabled="!canEdit" /></div></div>
            </div>
            <div class="tmb-field" style="margin-top: 10px"><label for="tmb-rtags">Look in these tags</label><TumblrTagBox v-model="draft.Reblogs.Tags" input-id="tmb-rtags" :max="30" label="Tags to reblog from" placeholder="Empty: the blog's own fixed and rotating tags" :disabled="!canEdit" />
              <span v-if="!draft.Reblogs.Tags.length" class="tmb-help">Busy tags like #memes move too fast for the curator to find posts that have earned notes; slower, specific tags work better.</span></div>
            <div class="tmb-chips" style="margin-top: 10px; gap: 16px">
              <label class="tmb-check"><input v-model="draft.Reblogs.Images" type="checkbox" :disabled="!canEdit" />Images</label>
              <label class="tmb-check"><input v-model="draft.Reblogs.Text" type="checkbox" :disabled="!canEdit" />Text</label>
              <label class="tmb-check" title="Only one frame of a video can be screened"><input v-model="draft.Reblogs.Videos" type="checkbox" :disabled="!canEdit" />Videos (always held)</label>
            </div>
            <div class="tmb-field" style="margin-top: 10px"><label for="tmb-rguide">Anything else to turn down</label><input id="tmb-rguide" v-model="draft.Reblogs.Guidance" class="tmb-input" maxlength="1000" placeholder="nothing about football" :disabled="!canEdit" /></div>
          </template>
        </section>

        <!-- publishing + notes -->
        <section class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="send" />Publishing</div>
          <div class="tmb-field" style="max-width: 280px"><label for="tmb-state">Post as</label>
            <select id="tmb-state" v-model="draft.PostState" class="tmb-select" :disabled="!canEdit"><option value="Published">Published</option><option value="Draft">Draft on Tumblr</option><option value="Private">Private</option></select></div>
          <div style="display: grid; gap: 8px; margin-top: 10px">
            <label class="tmb-check"><input v-model="approval" type="checkbox" :disabled="!canEdit" data-testid="tmb-require-approval" />Hold autopilot posts for my approval</label>
            <label class="tmb-check"><input v-model="draft.CreditSource" type="checkbox" :disabled="!canEdit" />Credit the original post as the Tumblr source</label>
          </div>
          <div class="tmb-field" style="margin-top: 14px">
            <label for="tmb-notes">Private notes about @{{ detail.Blog.Name }}</label>
            <textarea id="tmb-notes" v-model="notes" rows="3" maxlength="4000" class="tmb-textarea" :disabled="!canEdit"></textarea>
          </div>
          <div v-if="canEdit" style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap">
            <button class="tmb-btn tmb-btn--sm" @click="emit('plan')"><TumblrIcon name="calendar" />Plan now</button>
            <button class="tmb-btn tmb-btn--sm" @click="emit('sync')"><TumblrIcon name="refresh" />Refresh from Tumblr</button>
            <button class="tmb-btn tmb-btn--sm tmb-btn--danger" style="margin-left: auto" @click="emit('remove')"><TumblrIcon name="trash" />Stop managing</button>
          </div>
        </section>
      </div>

      <div v-if="canEdit && (dirty || saveError)" class="tmb-savebar" role="status" data-testid="tmb-savebar">
        <TumblrIcon :name="saveError ? 'alert' : 'edit'" :style="{ color: saveError ? 'var(--tmb-crit)' : 'var(--tmb-accent)' }" />
        <span style="flex: 1">{{ saveError ?? 'Unsaved changes. Upcoming captions are rewritten if the caption style changes.' }}</span>
        <button class="tmb-btn tmb-btn--ghost tmb-btn--sm" :disabled="saving" @click="discard">Discard</button>
        <button class="tmb-btn tmb-btn--primary tmb-btn--sm" :disabled="saving || !dirty" data-testid="tmb-save-strategy" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  DAY_LONG, DAY_SHORT, WEEK_ORDER, cloneDeep, contentThumbPath, fmtBytes, fmtClipLength, fmtCount, hhmmToMinute, minuteToHHMM, q, timeZoneOptions,
  tumblrGet, tumblrPost, uploadMedia,
  type BlogDetail, type CaptionMode, type CatalogOptions, type ContentPreview, type ContentSourceKind, type ReblogSettings, type Strategy, type WeeklySlot,
} from '~/composables/useOmniTumblr';

const props = defineProps<{ blogId: string; detail: BlogDetail | null; catalog: CatalogOptions | null; canEdit: boolean; canUpload: boolean; canDelete: boolean }>();
const emit = defineEmits<{
  save: [body: { strategy: Strategy; requireApproval: boolean; notes?: string }, done: (error: string | null) => void];
  plan: []; sync: []; remove: []; notify: [tone: string, text: string]; confirm: [title: string, text: string, done: (ok: boolean) => void];
}>();

const SOURCES: { value: ContentSourceKind; label: string; help: string }[] = [
  { value: 'MemeScraper', label: 'MemeScraper reels', help: 'Videos MemeScraper downloads from Instagram meme accounts, filtered by niche and account.' },
  { value: 'Library', label: 'Upload library', help: 'Files you upload for this blog: good for a curated series.' },
  { value: 'Folder', label: 'Server folder', help: 'Media files in a folder on the Omnipotent server.' },
  { value: 'None', label: 'Manual only', help: 'Autopilot plans nothing; only posts you compose go out.' },
];
const CAPTION_MODES: { value: CaptionMode; label: string; help: string }[] = [
  { value: 'AI', label: 'AI', help: 'A language model writes each caption in the blog\'s voice, after looking at the video if it can see.' },
  { value: 'Fixed', label: 'Fixed', help: 'The same caption on every post.' },
  { value: 'Rotate', label: 'Rotate', help: 'Takes turns through captions you write.' },
  { value: 'Original', label: 'Original', help: 'The source post\'s own caption, without its hashtags, mentions and “follow for more”.' },
  { value: 'None', label: 'None', help: 'No caption: the media speaks for itself.' },
];
const PRESETS: { label: string; slots: WeeklySlot[] }[] = [
  { label: 'Fri 18:00', slots: [{ Day: 5, Minute: 1080 }] },
  { label: 'Twice a week', slots: [{ Day: 2, Minute: 1080 }, { Day: 5, Minute: 1080 }] },
  { label: 'Weekdays 12:00', slots: [1, 2, 3, 4, 5].map(d => ({ Day: d, Minute: 720 })) },
  { label: 'Daily 18:00', slots: [0, 1, 2, 3, 4, 5, 6].map(d => ({ Day: d, Minute: 1080 })) },
  { label: 'Daily ×3', slots: [0, 1, 2, 3, 4, 5, 6].flatMap(d => [540, 840, 1200].map(m => ({ Day: d, Minute: m }))) },
  { label: 'Clear', slots: [] },
];
const REBLOG_DEFAULTS: ReblogSettings = { Enabled: false, PerDay: 3, Tags: [], MinNotes: 50, MaxAgeHours: 72, Images: true, Videos: false, Text: true, RequireApproval: true, StartHour: 9, EndHour: 23, Guidance: '' };
const zones = timeZoneOptions();

/** A copy with every newer setting present, so a server from before one still gives an editable strategy. */
function complete(strategy: Strategy): Strategy {
  const copy = cloneDeep(strategy);
  copy.Reblogs = { ...REBLOG_DEFAULTS, ...(copy.Reblogs ?? {}) };
  if (copy.ResearchTags == null) copy.ResearchTags = true;
  return copy;
}

const empty = (): Strategy => complete({ Slots: [], TimeZone: 'UTC', MemeScraper: { Niches: [], Sources: [] }, Folder: {}, Ai: { Examples: [] }, FixedTags: [], RotatingTags: [], CaptionPool: [] } as unknown as Strategy);
const draft = ref<Strategy>(props.detail ? complete(props.detail.Blog.Strategy) : empty());
const approval = ref(props.detail?.Blog.RequireApproval ?? false);
const notes = ref(props.detail?.Blog.Notes ?? '');
const saving = ref(false);
const saveError = ref<string | null>(null);
const times = reactive<Record<number, string>>({});
let adoptNext = false;

const dirty = computed(() => !!props.detail && (JSON.stringify(draft.value) !== JSON.stringify(complete(props.detail.Blog.Strategy))
  || approval.value !== props.detail.Blog.RequireApproval || notes.value !== (props.detail.Blog.Notes ?? '')));

// A refresh from the server never wipes an edit in progress; after a save the server's cleaned copy is taken.
watch(() => props.detail, (d, before) => {
  if (!d) return;
  const switched = before?.Blog.BlogId !== d.Blog.BlogId;
  if (switched || adoptNext || !dirtyAgainst(before)) {
    draft.value = complete(d.Blog.Strategy);
    approval.value = d.Blog.RequireApproval;
    notes.value = d.Blog.Notes ?? '';
    adoptNext = false;
    saveError.value = null;
    if (switched) { previewResult.value = null; void loadLibrary(); }
  }
});
function dirtyAgainst(d: BlogDetail | null | undefined): boolean {
  if (!d) return false;
  return JSON.stringify(draft.value) !== JSON.stringify(complete(d.Blog.Strategy)) || approval.value !== d.Blog.RequireApproval || notes.value !== (d.Blog.Notes ?? '');
}

const runwayWeeks = computed(() => props.detail?.Runway.WeeksOfContent ?? null);
const runwayTitle = computed(() => {
  const r = props.detail?.Runway;
  if (!r || r.Error) return '';
  return `${r.Eligible ?? 0} unused items match this blog's filters${r.SlotsPerWeek ? ` at ${r.SlotsPerWeek} a week` : ''}`;
});

const sortedSlots = computed(() => [...draft.value.Slots].sort((a, b) => a.Day - b.Day || a.Minute - b.Minute));
const slotsFor = (day: number) => sortedSlots.value.filter(s => s.Day === day);
function setSlots(next: WeeklySlot[]) {
  const unique = new Map<string, WeeklySlot>();
  for (const s of next) unique.set(`${s.Day}:${s.Minute}`, { Day: s.Day, Minute: s.Minute });
  draft.value.Slots = [...unique.values()];
}
function addSlot(day: number) {
  const minute = hhmmToMinute(times[day] ?? '');
  if (minute === null) return;
  setSlots([...draft.value.Slots, { Day: day, Minute: minute }]);
  times[day] = '';
}
const removeSlot = (day: number, minute: number) => setSlots(draft.value.Slots.filter(s => !(s.Day === day && s.Minute === minute)));
function copyToAll(day: number) {
  const minutes = slotsFor(day).map(s => s.Minute);
  setSlots([0, 1, 2, 3, 4, 5, 6].flatMap(d => minutes.map(m => ({ Day: d, Minute: m }))));
}

const hasNiche = (name: string) => draft.value.MemeScraper.Niches.some(n => n.toLowerCase() === name.toLowerCase());
function toggleNiche(name: string) {
  const niches = draft.value.MemeScraper.Niches;
  draft.value.MemeScraper.Niches = hasNiche(name) ? niches.filter(n => n.toLowerCase() !== name.toLowerCase()) : [...niches, name];
}
const sourceSuggestions = computed(() => {
  const chosen = new Set(draft.value.MemeScraper.Sources.map(s => s.toLowerCase()));
  const niches = draft.value.MemeScraper.Niches.map(n => n.toLowerCase());
  return (props.catalog?.Sources ?? [])
    .filter(s => !chosen.has(s.Username.toLowerCase()) && (!niches.length || s.Niches.some(n => niches.includes(n.toLowerCase()))))
    .sort((a, b) => b.Reels - a.Reels).slice(0, 8);
});

const examplesText = computed({ get: () => draft.value.Ai.Examples.join('\n'), set: (v: string) => { draft.value.Ai.Examples = v.split('\n').map(s => s.trim()).filter(Boolean); } });
const poolText = computed({ get: () => draft.value.CaptionPool.join('\n'), set: (v: string) => { draft.value.CaptionPool = v.split('\n').map(s => s.trim()).filter(Boolean); } });
const modelText = computed({ get: () => draft.value.Ai.Model ?? '', set: (v: string) => { draft.value.Ai.Model = v.trim() || null; } });

function discard() {
  if (!props.detail) return;
  draft.value = complete(props.detail.Blog.Strategy);
  approval.value = props.detail.Blog.RequireApproval;
  notes.value = props.detail.Blog.Notes ?? '';
  saveError.value = null;
}

function save() {
  if (!props.detail) return;
  saving.value = true;
  saveError.value = null;
  const body: { strategy: Strategy; requireApproval: boolean; notes?: string } = { strategy: draft.value, requireApproval: approval.value };
  if (notes.value !== (props.detail.Blog.Notes ?? '')) body.notes = notes.value;
  emit('save', body, error => {
    saving.value = false;
    if (error) saveError.value = error;
    else adoptNext = true;
  });
}

// ── caption test ──
const previewing = ref(false);
const previewError = ref<string | null>(null);
const previewDirection = ref('');
const previewResult = ref<{ Caption: string; Tags: string[]; DroppedTags?: string[]; Model: string | null; UsedVision: boolean; FramesSent: number; Content: ContentPreview } | null>(null);
async function preview() {
  previewing.value = true;
  previewError.value = null;
  try {
    const result = await tumblrPost<NonNullable<typeof previewResult.value>>('/omnitumblr/captions/preview', { blogId: props.blogId, strategy: draft.value, instruction: previewDirection.value.trim() || null });
    if (!result.ok || !result.data) previewError.value = result.error;
    else previewResult.value = result.data;
  } finally {
    previewing.value = false;
  }
}

// ── library ──
interface LibraryFile { FileName: string; Key: string; Kind: string; Bytes: number; AddedUtc: string; Used: boolean }
const library = ref<LibraryFile[]>([]);
const uploads = ref<{ id: number; name: string; percent: number; done: boolean; error: string | null }[]>([]);
const dragging = ref(false);
const picker = ref<HTMLInputElement | null>(null);
let uploadId = 0;

async function loadLibrary() {
  if (draft.value.Source !== 'Library') return;
  const result = await tumblrGet<{ Files: LibraryFile[] }>(`/omnitumblr/library${q({ blogId: props.blogId })}`);
  if (result.ok && result.data) library.value = result.data.Files;
}
watch(() => draft.value.Source, source => { if (source === 'Library') void loadLibrary(); }, { immediate: true });

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) void uploadAll(Array.from(input.files));
  input.value = '';
}
function onDrop(event: DragEvent) {
  dragging.value = false;
  if (props.canUpload && event.dataTransfer?.files) void uploadAll(Array.from(event.dataTransfer.files));
}
async function uploadAll(files: File[]) {
  for (const file of files) {
    uploads.value.push({ id: ++uploadId, name: file.name, percent: 0, done: false, error: null });
    const tracked = uploads.value[uploads.value.length - 1];
    try {
      await uploadMedia(file, 'library', props.blogId, pct => { tracked.percent = pct; }).promise;
      tracked.done = true;
    } catch (error: any) {
      tracked.error = error?.message ?? 'Upload failed';
    }
  }
  await loadLibrary();
  window.setTimeout(() => { uploads.value = uploads.value.filter(u => !u.done); }, 4000);
}
function deleteFile(fileName: string) {
  emit('confirm', 'Delete this file?', `${fileName} is removed from the library.`, async ok => {
    if (!ok) return;
    const result = await tumblrPost('/omnitumblr/library/delete', { blogId: props.blogId, fileName });
    if (!result.ok) emit('notify', 'crit', result.error ?? 'Could not delete it');
    await loadLibrary();
  });
}
</script>
