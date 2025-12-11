import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Represents a discovered Tusk service from a .tusk/config.yaml file
 */
export interface DiscoveredService {
  /** The service ID from the config */
  id: string;
  /** The service name from the config */
  name: string;
  /** Path to the .tusk/config.yaml file */
  configPath: string;
  /** Root directory containing the .tusk folder */
  rootPath: string;
}

/**
 * Parse a .tusk/config.yaml file to extract service info.
 * Uses simple regex parsing to avoid YAML dependency.
 */
function parseConfigYaml(configPath: string): { id?: string; name?: string } {
  try {
    const content = fs.readFileSync(configPath, "utf-8");

    // Simple regex parsing for id and name under service:
    // Looks for patterns like:
    //   service:
    //     id: "xxx"
    //     name: "yyy"
    const idMatch = content.match(
      /service:\s*\n(?:[^\n]*\n)*?\s*id:\s*["']?([^"'\n]+)["']?/
    );
    const nameMatch = content.match(
      /service:\s*\n(?:[^\n]*\n)*?\s*name:\s*["']?([^"'\n]+)["']?/
    );

    return {
      id: idMatch?.[1]?.trim(),
      name: nameMatch?.[1]?.trim(),
    };
  } catch {
    return {};
  }
}

/**
 * Recursively search for .tusk/config.yaml files starting from the given roots.
 * Searches up to maxDepth levels deep.
 */
function findTuskConfigs(
  roots: string[],
  maxDepth: number = 3
): DiscoveredService[] {
  const services: DiscoveredService[] = [];
  const visited = new Set<string>();

  function searchDirectory(dir: string, depth: number): void {
    if (depth > maxDepth || visited.has(dir)) {
      return;
    }
    visited.add(dir);

    const configPath = path.join(dir, ".tusk", "config.yaml");

    if (fs.existsSync(configPath)) {
      const parsed = parseConfigYaml(configPath);
      if (parsed.id) {
        services.push({
          id: parsed.id,
          name: parsed.name || path.basename(dir),
          configPath,
          rootPath: dir,
        });
      }
      // Don't search subdirectories if we found a config here
      return;
    }

    // Search subdirectories
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          searchDirectory(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  for (const root of roots) {
    // Normalize the path and resolve symlinks
    try {
      const resolvedRoot = fs.realpathSync(root);
      searchDirectory(resolvedRoot, 0);
    } catch {
      // If we can't resolve the path, try it directly
      searchDirectory(root, 0);
    }
  }

  return services;
}

/**
 * Service discovery context that manages discovered services
 * and provides the appropriate service ID for API calls.
 */
export class ServiceDiscoveryContext {
  private discoveredServices: DiscoveredService[] = [];
  private defaultServiceId?: string;

  constructor(envServiceId?: string) {
    this.defaultServiceId = envServiceId;
  }

  /**
   * Discover services from the given workspace roots.
   */
  discoverFromRoots(roots: string[]): void {
    this.discoveredServices = findTuskConfigs(roots);
    console.error(
      `Discovered ${this.discoveredServices.length} Tusk service(s):`
    );
    for (const service of this.discoveredServices) {
      console.error(`  - ${service.name} (${service.id})`);
    }
  }

  /**
   * Get all discovered services.
   */
  getServices(): DiscoveredService[] {
    return this.discoveredServices;
  }

  /**
   * Get the service ID to use for an API call.
   * Priority:
   * 1. Explicitly provided serviceId
   * 2. Environment variable default
   * 3. Single discovered service (if only one)
   * 4. Error if multiple discovered and none specified
   */
  resolveServiceId(providedServiceId?: string): string {
    // 1. Explicit service ID
    if (providedServiceId) {
      return providedServiceId;
    }

    // 2. Environment variable default
    if (this.defaultServiceId) {
      return this.defaultServiceId;
    }

    // 3. Single discovered service
    if (this.discoveredServices.length === 1) {
      return this.discoveredServices[0].id;
    }

    // 4. Multiple or no services
    if (this.discoveredServices.length === 0) {
      throw new Error(
        "No Tusk service configured. Either set TUSK_DRIFT_SERVICE_ID " +
          "environment variable or ensure a .tusk/config.yaml exists in your workspace."
      );
    }

    // Multiple services found
    const serviceList = this.discoveredServices
      .map((s) => `  - "${s.name}" (id: ${s.id})`)
      .join("\n");
    throw new Error(
      `Multiple Tusk services found. Please specify observableServiceId:\n${serviceList}`
    );
  }

  /**
   * Check if we have any services available (discovered or default).
   */
  hasServices(): boolean {
    return !!this.defaultServiceId || this.discoveredServices.length > 0;
  }

  /**
   * Get instructions text about available services.
   */
  getServicesDescription(): string {
    if (this.discoveredServices.length === 0) {
      if (this.defaultServiceId) {
        return `Using configured service: ${this.defaultServiceId}`;
      }
      return "No services discovered.";
    }

    if (this.discoveredServices.length === 1) {
      const s = this.discoveredServices[0];
      return `Using service: "${s.name}" (id: ${s.id}, path: ${s.rootPath})`;
    }

    const serviceList = this.discoveredServices
      .map((s) => `- "${s.name}" (id: ${s.id}, path: ${s.rootPath})`)
      .join("\n");
    return `Multiple services available. Specify observableServiceId when querying:\n${serviceList}`;
  }
}
