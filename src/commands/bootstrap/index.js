import { Command } from "commander";
import { input, select, confirm, password } from "@inquirer/prompts";
import Conf from "conf";
import chalk from "chalk";
import ora from "ora";
import client from "../../lib/client.js";
import entitiesQuery from "../../lib/queries/entities.js";
import entityUpdateMutation from "../../lib/mutations/entity-update.js";
import { errMsg, verboseErr, sanitizeColor, resolveUrl, guessMimeType } from "./utils.js";
import { extractMetaFromHtml } from "./scrape.js";
import { analyzeWithLLM, generateEmailTemplate } from "./llm.js";

const config = new Conf({ projectName: "bunny-cli" });

const bootstrap = new Command("bootstrap")
  .description("AI-powered onboarding: apply branding from a domain to a warren entity")
  .option("-p, --profile <name>", "Profile name", "default")
  .option("-v, --verbose", "Show verbose error output")
  .action(async (options) => {
    // 1. Load profile
    const profile = config.get(`profiles.${options.profile}`);
    if (!profile) {
      console.error(
        chalk.red(
          `Profile '${options.profile}' not found. Run "bunny configure" first.`
        )
      );
      process.exit(1);
    }
    const { baseUrl, clientId, clientSecret } = profile;

    // 2. LLM setup
    let llmProvider = profile.llmProvider;
    let llmApiKey = profile.llmApiKey;

    if (!llmProvider || !llmApiKey) {
      llmProvider = await select({
        message: "Select LLM provider:",
        choices: [
          { name: "OpenAI (gpt-4o)", value: "OpenAI" },
          { name: "Anthropic (claude-opus-4-6)", value: "Anthropic" },
        ],
      });

      llmApiKey = await password({
        message: `Enter your ${llmProvider} API key:`,
        mask: "*",
      });

      config.set(`profiles.${options.profile}.llmProvider`, llmProvider);
      config.set(`profiles.${options.profile}.llmApiKey`, llmApiKey);
      console.log(chalk.gray("LLM provider saved to profile."));
    } else {
      console.log(chalk.gray(`Using saved LLM provider: ${llmProvider}`));
    }

    // 3. Domain input
    let domain = await input({
      message: "Enter the customer's domain (e.g. acme.com):",
    });
    domain = domain.trim();
    if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
      domain = "https://" + domain;
    }

    // 4. Analyze domain with LLM
    let branding;
    {
      const spinner = ora("Fetching website and analyzing with AI...").start();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let html = "";
        try {
          const res = await fetch(domain, {
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; bunny-cli/1.0)" },
          });
          clearTimeout(timeout);
          html = await res.text();
        } catch (fetchErr) {
          clearTimeout(timeout);
          spinner.warn(
            chalk.yellow(`Could not fetch ${domain}: ${fetchErr.message}. Proceeding with domain name only.`)
          );
        }

        const meta = extractMetaFromHtml(html);
        spinner.text = "Asking LLM to analyze branding...";
        branding = await analyzeWithLLM(llmProvider, llmApiKey, domain, meta);

        // Resolve relative logo URL against the domain
        if (branding.logoUrl) {
          branding.logoUrl = resolveUrl(domain, branding.logoUrl);
        }

        // Normalize colors to bare hex digits (API rejects # prefix)
        branding.brandColor = sanitizeColor(branding.brandColor);
        branding.accentColor = sanitizeColor(branding.accentColor);

        spinner.succeed("Branding analysis complete.");
      } catch (err) {
        spinner.fail(chalk.red("Failed to analyze domain: " + errMsg(err)));
        if (options.verbose) console.error(chalk.gray(verboseErr(err)));
        process.exit(1);
      }
    }

    // 5. Fetch entities & select
    const bunnyClient = client(baseUrl, clientId, clientSecret);
    let entities;
    {
      const spinner = ora("Fetching entities...").start();
      try {
        entities = await entitiesQuery(bunnyClient, options.verbose);
        spinner.succeed(`Found ${entities.length} entity/entities.`);
      } catch (err) {
        spinner.fail(chalk.red("Failed to fetch entities: " + errMsg(err)));
        if (options.verbose) console.error(chalk.gray(verboseErr(err)));
        process.exit(1);
      }
    }

    if (entities.length === 0) {
      console.error(chalk.red("No entities found in this Bunny instance."));
      process.exit(1);
    }

    const selectedEntityId = await select({
      message: "Select the entity to apply branding to:",
      choices: entities.map((e) => ({ name: e.name, value: e.id })),
    });
    const selectedEntity = entities.find((e) => e.id === selectedEntityId);

    // 6. Generate branded email template
    let emailTemplate;
    {
      const spinner = ora("Generating branded email template...").start();
      try {
        emailTemplate = await generateEmailTemplate(
          llmProvider,
          llmApiKey,
          selectedEntity.emailTemplate,
          branding.logoUrl,
          branding.brandColor,
          branding.accentColor,
          domain
        );
        spinner.succeed("Email template generated.");
      } catch (err) {
        spinner.fail(chalk.red("Failed to generate email template: " + errMsg(err)));
        if (options.verbose) console.error(chalk.gray(verboseErr(err)));
        process.exit(1);
      }
    }

    // 7. Download logo image
    let logoBuffer;
    let mimeType = "image/png";
    {
      const spinner = ora(`Downloading logo from ${branding.logoUrl}...`).start();
      try {
        const res = await fetch(branding.logoUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; bunny-cli/1.0)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.startsWith("image/")) {
          mimeType = contentType.split(";")[0].trim();
        } else {
          mimeType = guessMimeType(branding.logoUrl);
        }
        const arrayBuffer = await res.arrayBuffer();
        logoBuffer = Buffer.from(arrayBuffer);
        spinner.succeed(`Downloaded logo (${logoBuffer.length} bytes, ${mimeType}).`);
      } catch (err) {
        spinner.fail(chalk.red("Failed to download logo: " + errMsg(err)));
        if (options.verbose) console.error(chalk.gray(verboseErr(err)));
        process.exit(1);
      }
    }

    // 8. Preview planned changes
    console.log("\n" + chalk.bold("Planned changes:"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(`  Entity:            ${chalk.cyan(selectedEntity.name)}`);
    console.log(`  Logo URL:          ${chalk.cyan(branding.logoUrl)} (nav + document)`);
    console.log(`  Brand color:       ${chalk.hex("#" + (branding.brandColor || "888888"))("#" + (branding.brandColor || "n/a"))}`);
    console.log(`  Accent color:      ${chalk.hex("#" + (branding.accentColor || "888888"))("#" + (branding.accentColor || "n/a"))}`);
    console.log(`  Email template:    ${chalk.cyan("updated with brand colors and logo")}`);
    console.log(chalk.gray("─".repeat(50)) + "\n");

    // 9. Confirm
    const confirmed = await confirm({
      message: "Apply these changes?",
    });
    if (!confirmed) {
      console.log(chalk.yellow("Cancelled."));
      return;
    }

    // 10. Upload logo images via REST PUT
    const token = bunnyClient.options?.accessToken;
    if (!token) {
      console.error(chalk.red("No access token available. Ensure entities were fetched successfully."));
      process.exit(1);
    }

    const uploadImage = async (label, name) => {
      const spinner = ora(`Uploading ${label}...`).start();
      try {
        const formData = new FormData();
        formData.append("image", new Blob([logoBuffer], { type: mimeType }), "logo");
        formData.append("entity_id", selectedEntity.id);

        const res = await fetch(`${baseUrl}/api/images/branding?name=${name}`, {
          method: "PUT",
          headers: { Authorization: `bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
        }

        spinner.succeed(`${label} uploaded successfully.`);
      } catch (err) {
        spinner.fail(chalk.red(`Failed to upload ${label}: ` + errMsg(err)));
        if (options.verbose) console.error(chalk.gray(verboseErr(err)));
        process.exit(1);
      }
    };

    await uploadImage("nav logo", "top_nav_image");
    await uploadImage("document image", "quote_image");

    // 11. Update entity via GraphQL
    {
      const spinner = ora("Updating entity branding...").start();
      try {
        const attributes = {};
        const brandColor = sanitizeColor(branding.brandColor);
        const accentColor = sanitizeColor(branding.accentColor);
        if (brandColor) attributes.brandColor = brandColor;
        if (accentColor) attributes.accentColor = accentColor;
        if (emailTemplate) attributes.emailTemplate = emailTemplate;

        await entityUpdateMutation(bunnyClient, selectedEntity.id, attributes);
        spinner.succeed("Entity updated successfully.");
      } catch (err) {
        spinner.fail(chalk.red("Failed to update entity: " + errMsg(err)));
        if (options.verbose) console.error(chalk.gray(verboseErr(err)));
        process.exit(1);
      }
    }

    // 12. Success
    console.log(
      "\n" +
        chalk.green(
          `✓ Bootstrap complete! Entity '${selectedEntity.name}' has been updated with branding from ${domain}.`
        )
    );
  });

export default bootstrap;
