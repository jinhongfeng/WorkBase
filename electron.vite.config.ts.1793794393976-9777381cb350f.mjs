import "node:module";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
// electron.vite.config.ts
const alias = {
	"@shared": resolve("src/shared"),
	"@renderer": resolve("src/renderer/src")
};
var electron_vite_config_default = defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		resolve: { alias },
		build: {
			emptyOutDir: false,
			outDir: "dist/main",
			rollupOptions: { external: ["better-sqlite3", "electron"] }
		}
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		resolve: { alias },
		build: {
			emptyOutDir: false,
			outDir: "dist/preload",
			rollupOptions: {
				external: ["better-sqlite3", "electron"],
				output: {
					format: "cjs",
					entryFileNames: "index.cjs"
				}
			}
		}
	},
	renderer: {
		plugins: [tailwindcss()],
		resolve: { alias },
		build: {
			emptyOutDir: false,
			outDir: "dist/renderer"
		}
	}
});
export { electron_vite_config_default as default };

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb24udml0ZS5jb25maWcuanMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiRTovdmliZWNvZGluZy93b3JrYmFzZS9lbGVjdHJvbi52aXRlLmNvbmZpZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBkZWZpbmVDb25maWcsIGV4dGVybmFsaXplRGVwc1BsdWdpbiB9IGZyb20gJ2VsZWN0cm9uLXZpdGUnXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJ1xuXG5jb25zdCBhbGlhcyA9IHsgJ0BzaGFyZWQnOiByZXNvbHZlKCdzcmMvc2hhcmVkJyksICdAcmVuZGVyZXInOiByZXNvbHZlKCdzcmMvcmVuZGVyZXIvc3JjJykgfVxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgbWFpbjogeyBwbHVnaW5zOiBbZXh0ZXJuYWxpemVEZXBzUGx1Z2luKCldLCByZXNvbHZlOiB7IGFsaWFzIH0sIGJ1aWxkOiB7XG4gICAgZW1wdHlPdXREaXI6IGZhbHNlLCBvdXREaXI6ICdkaXN0L21haW4nLCByb2xsdXBPcHRpb25zOiB7IGV4dGVybmFsOiBbJ2JldHRlci1zcWxpdGUzJywgJ2VsZWN0cm9uJ10gfVxuICB9IH0sXG4gIHByZWxvYWQ6IHsgcGx1Z2luczogW2V4dGVybmFsaXplRGVwc1BsdWdpbigpXSwgcmVzb2x2ZTogeyBhbGlhcyB9LCBidWlsZDoge1xuICAgIGVtcHR5T3V0RGlyOiBmYWxzZSwgb3V0RGlyOiAnZGlzdC9wcmVsb2FkJywgcm9sbHVwT3B0aW9uczogeyBleHRlcm5hbDogWydiZXR0ZXItc3FsaXRlMycsICdlbGVjdHJvbiddLCBvdXRwdXQ6IHsgZm9ybWF0OiAnY2pzJywgZW50cnlGaWxlTmFtZXM6ICdpbmRleC5janMnIH0gfVxuICB9IH0sXG4gIHJlbmRlcmVyOiB7IHBsdWdpbnM6IFt0YWlsd2luZGNzcygpXSwgcmVzb2x2ZTogeyBhbGlhcyB9LCBidWlsZDogeyBlbXB0eU91dERpcjogZmFsc2UsIG91dERpcjogJ2Rpc3QvcmVuZGVyZXInIH0gfVxufSlcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFJQSxNQUFNLFFBQVE7Q0FBRSxXQUFXLFFBQVEsWUFBWTtDQUFHLGFBQWEsUUFBUSxrQkFBa0I7QUFBRTtBQUMzRixJQUFBLCtCQUFlLGFBQWE7Q0FDMUIsTUFBTTtFQUFFLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQztFQUFHLFNBQVMsRUFBRSxNQUFNO0VBQUcsT0FBTztHQUNyRSxhQUFhO0dBQU8sUUFBUTtHQUFhLGVBQWUsRUFBRSxVQUFVLENBQUMsa0JBQWtCLFVBQVUsRUFBRTtFQUNyRztDQUFFO0NBQ0YsU0FBUztFQUFFLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQztFQUFHLFNBQVMsRUFBRSxNQUFNO0VBQUcsT0FBTztHQUN4RSxhQUFhO0dBQU8sUUFBUTtHQUFnQixlQUFlO0lBQUUsVUFBVSxDQUFDLGtCQUFrQixVQUFVO0lBQUcsUUFBUTtLQUFFLFFBQVE7S0FBTyxnQkFBZ0I7SUFBWTtHQUFFO0VBQ2hLO0NBQUU7Q0FDRixVQUFVO0VBQUUsU0FBUyxDQUFDLFlBQVksQ0FBQztFQUFHLFNBQVMsRUFBRSxNQUFNO0VBQUcsT0FBTztHQUFFLGFBQWE7R0FBTyxRQUFRO0VBQWdCO0NBQUU7QUFDbkgsQ0FBQyJ9